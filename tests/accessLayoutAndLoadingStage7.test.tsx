import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { Spinner } from '../src/shared/components/Spinner';

/** Regresiones de presentación: no deben modificar permisos ni la sesión. */
const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

describe('Acceso y disposición de navegación', () => {
  it('separa la marca y el selector de tema hasta los extremos del encabezado', () => {
    const login = source('src/modules/auth/AuthEntryPage.tsx');
    expect(login).toContain('w-full shrink-0 items-center justify-between');
    expect(login).toContain('px-5 md:px-8');
    expect(login).not.toContain('max-w-6xl items-center justify-between px-6 py-6');
  });

  it('no muestra marca, selector de tema ni pie durante Verificando acceso', () => {
    const login = source('src/modules/auth/AuthEntryPage.tsx');
    expect(login).toContain('{!loading && <header');
    expect(login).toContain('{!loading && <footer');
    expect(login).toContain('Verificando acceso');
    expect(login).toContain('Comprobando sesión y rol en Supabase');
  });

  it('coloca Configuración inmediatamente debajo de Usuarios en el sidebar', () => {
    const shell = source('src/app/layout/AppShell.tsx');
    expect(shell).toMatch(/to: '\/usuarios'[^\n]+\n  \{ to: '\/configuracion'/);
  });
});

describe('Carga consistente con Spinner compartido', () => {
  it('presenta un indicador giratorio y accesible', () => {
    const markup = renderToStaticMarkup(<Spinner label="Cargando datos…"/>);
    expect(markup).toContain('animate-spin');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('Cargando datos…');
  });

  it('usa el Spinner en la primera carga y actualización del directorio de usuarios', () => {
    const users = source('src/modules/users/UsersPage.tsx');
    expect(users).toContain('firstLoad && loading');
    expect(users).toContain('Cargando usuarios desde Supabase…');
    expect(users).toContain('Actualizando…');
    expect(users).toContain('setFirstLoad(false)');
  });

  it('usa el Spinner al consultar por primera vez incidentes y reportes', () => {
    const incidents = source('src/modules/incidents/IncidentsPage.tsx');
    const reports = source('src/modules/reports/ReportsPage.tsx');
    expect(incidents).toContain('<Spinner label="Consultando historial común en Supabase…"/>');
    expect(reports).toContain('<Spinner label="Consultando informes de todos los usuarios…"/>');
  });
});
