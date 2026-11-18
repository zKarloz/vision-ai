/**
 * VISION AI · Administración de cuentas desde Supabase Auth.
 * El servidor verifica JWT + membresía admin antes de usar supabaseAdmin.
 * Las contraseñas temporales solo aparecen en la respuesta HTTPS de creación;
 * nunca se almacenan en tablas, logs ni variables del frontend.
 */
import { withSupabase } from 'npm:@supabase/server@1';

type Role = 'administrador' | 'operador' | 'supervisor' | 'auditor';
const roles = new Set<Role>(['administrador', 'operador', 'supervisor', 'auditor']);
const roleOk = (value: unknown): value is Role => typeof value === 'string' && roles.has(value as Role);
const uuidOk = (value: unknown): value is string => typeof value === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
const json = (data: unknown, status = 200) => Response.json(data, { status });
const error = (message: string, status: number) => json({ error: message }, status);

export default {
  fetch: withSupabase({ auth: 'user' }, async (request, ctx) => {
    if (request.method !== 'POST') return error('Método no permitido.', 405);
    // @supabase/server entrega la identidad normalizada en userClaims.id; sub es de jwtClaims.
    const caller = ctx.userClaims?.id;
    if (!uuidOk(caller)) return error('Sesión no verificada.', 401);
    let body: Record<string, unknown>;
    try { body = await request.json(); }
    catch { return error('Solicitud JSON inválida.', 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return error('Solicitud inválida.', 400);

    // Primera contraseña: cada usuario cambia ÚNICAMENTE su propia clave temporal.
    if (body.action === 'change-first-password') {
      const newPassword = body.password;
      if (typeof newPassword !== 'string' || newPassword.length < 12 || newPassword.length > 128) {
        return error('La contraseña debe tener entre 12 y 128 caracteres.', 400);
      }
      const { data: current, error: currentError } = await ctx.supabaseAdmin.auth.admin.getUserById(caller);
      if (currentError || !current.user) return error('No se pudo verificar la cuenta.', 401);
      if (current.user.app_metadata?.vision_ai_password_change_required !== true) {
        return error('Esta cuenta no necesita cambiar su contraseña temporal.', 409);
      }
      const { error: changeError } = await ctx.supabaseAdmin.auth.admin.updateUserById(caller, {
        password: newPassword,
        app_metadata: { ...current.user.app_metadata, vision_ai_password_change_required: false },
      });
      if (changeError) return error('Supabase rechazó la contraseña. Verifica su complejidad y las reglas configuradas en Authentication.', 422);
      return json({ ok: true });
    }

    // NUNCA confiar en un rol que envía el navegador: se consulta PostgreSQL.
    const { data: member, error: memberError } = await ctx.supabaseAdmin.from('vision_ai_members')
      .select('role').eq('user_id', caller).maybeSingle();
    if (memberError) return error('No se pudo consultar la autorización.', 503);
    if (member?.role !== 'administrador') return error('Operación exclusiva del administrador.', 403);

    if (body.action === 'list') {
      const { data: members, error: listError } = await ctx.supabaseAdmin.from('vision_ai_members')
        .select('user_id,role,created_at').order('created_at', { ascending: true }).limit(200);
      if (listError) return error('No se pudo consultar el directorio.', 502);
      // Una única petición de Auth evita hasta 200 peticiones individuales.
      const { data: directoryData, error: usersError } = await ctx.supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (usersError) return error('No se pudieron consultar los correos.', 502);
      const byId = new Map((directoryData.users ?? []).map(user => [user.id, user]));
      const directory = (members ?? []).map(membership => {
        const user = byId.get(membership.user_id);
        return {
          id: membership.user_id, email: user?.email ?? 'Cuenta sin correo',
          role: membership.role, createdAt: membership.created_at,
          lastSignInAt: user?.last_sign_in_at ?? null,
          passwordChangeRequired: user?.app_metadata?.vision_ai_password_change_required === true,
        };
      });
      return json({ users: directory, truncated: directory.length === 200 });
    }

    if (body.action === 'create') {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !roleOk(body.role)) {
        return error('Correo o rol inválido.', 400);
      }
      // Supabase Free no requiere SMTP: admin genera una contraseña temporal aleatoria.
      const tempPassword = `${crypto.randomUUID()}Aa9!`;
      const { data, error: creationError } = await ctx.supabaseAdmin.auth.admin.createUser({
        email, password: tempPassword, email_confirm: true,
        app_metadata: { vision_ai_password_change_required: true },
      });
      if (creationError || !data.user) return error('No se pudo crear la cuenta; comprueba si ya existe.', 409);
      const uid = data.user.id;
      const { error: membershipError } = await ctx.supabaseAdmin.from('vision_ai_members')
        .insert({ user_id: uid, role: body.role });
      if (membershipError) {
        await ctx.supabaseAdmin.auth.admin.deleteUser(uid);
        return error('No se asignó la membresía; se revirtió la creación.', 502);
      }
      const { error: auditError } = await ctx.supabaseAdmin.from('vision_ai_user_audit').insert({
        actor_id: caller, target_id: uid, action: 'created', new_role: body.role,
      });
      if (auditError) {
        await ctx.supabaseAdmin.from('vision_ai_members').delete().eq('user_id', uid);
        await ctx.supabaseAdmin.auth.admin.deleteUser(uid);
        return error('Falló la auditoría; se revirtió la creación.', 502);
      }
      return json({ ok: true, temporaryPassword: tempPassword }, 201);
    }

    // Recuperación de cuentas: operación ADMIN autenticada y auditada.
    // La contraseña temporal se devuelve una sola vez, nunca se almacena.
    if (body.action === 'reset-password') {
      if (!uuidOk(body.userId)) return error('Usuario inválido.', 400);
      if (body.userId === caller) return error('No puedes restablecer tu propia contraseña aquí.', 403);
      const { data: target, error: targetError } = await ctx.supabaseAdmin.auth.admin.getUserById(body.userId);
      if (targetError || !target.user) return error('Usuario no encontrado.', 404);
      const { data: targetMember, error: membershipError } = await ctx.supabaseAdmin.from('vision_ai_members')
        .select('role').eq('user_id', body.userId).maybeSingle();
      if (membershipError || !targetMember || !roleOk(targetMember.role)) return error('Membresía no encontrada.', 404);
      const temporaryPassword = `${crypto.randomUUID()}Aa9!`;
      const { error: resetError } = await ctx.supabaseAdmin.auth.admin.updateUserById(body.userId, {
        password: temporaryPassword,
        app_metadata: { ...target.user.app_metadata, vision_ai_password_change_required: true },
      });
      if (resetError) return error('Supabase no pudo restablecer la contraseña.', 502);
      const { error: auditError } = await ctx.supabaseAdmin.from('vision_ai_user_audit').insert({
        actor_id: caller, target_id: body.userId, action: 'password_reset',
        old_role: targetMember.role, new_role: targetMember.role,
      });
      // No perder la contraseña temporal si falla la auditoría: en tal caso,
      // el servidor lo declara explícitamente para poder investigar.
      return json({ ok: true, temporaryPassword,
        ...(auditError ? { auditWarning: 'No se registró la auditoría del restablecimiento.' } : {}),
      });
    }

    if (body.action === 'set-role') {
      if (!uuidOk(body.userId) || !roleOk(body.role)) return error('Usuario o rol inválido.', 400);
      if (body.userId === caller) return error('No puedes modificar tu propio rol.', 403);
      const { data: current, error: readError } = await ctx.supabaseAdmin.from('vision_ai_members')
        .select('role').eq('user_id', body.userId).maybeSingle();
      if (readError || !current) return error('No se encontró la membresía.', 404);
      if (current.role === body.role) return json({ ok: true, unchanged: true });
      const { error: updateError } = await ctx.supabaseAdmin.from('vision_ai_members')
        .update({ role: body.role }).eq('user_id', body.userId);
      if (updateError) return error('No se pudo modificar el rol.', 502);
      const { error: auditError } = await ctx.supabaseAdmin.from('vision_ai_user_audit').insert({
        actor_id: caller, target_id: body.userId, action: 'role_changed',
        old_role: current.role, new_role: body.role,
      });
      if (auditError) {
        await ctx.supabaseAdmin.from('vision_ai_members').update({ role: current.role }).eq('user_id', body.userId);
        return error('No se registró la auditoría; se intentó restaurar el rol.', 502);
      }
      return json({ ok: true });
    }
    return error('Acción no reconocida.', 400);
  }),
};
