/** Contrato TypeScript del auditor de despliegue sin dependencias externas. */
export declare const MODEL_SHA256: string;
export interface ReleaseAuditResult { ok: boolean; checks: string[]; errors: string[] }
export declare function inspectRelease(root: string, expectedModelHash?: string): ReleaseAuditResult;
