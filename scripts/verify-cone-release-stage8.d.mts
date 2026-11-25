/** Contrato tipado para la verificación del ONNX E2 empaquetado por Vite. */
export const CONE_MODEL_SHA256: string;
export function verifyConeRelease(root?: string, expectedHash?: string): Promise<{
  file: string;
  bytes: number;
  sha256: string;
}>;
