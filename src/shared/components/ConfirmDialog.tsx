import { Button } from './Button';
import { Modal } from './Modal';

/** Confirmación para acciones destructivas sin window.confirm. */
export function ConfirmDialog({ open, title, message, onCancel, onConfirm, confirmLabel = 'Eliminar registro' }: { open: boolean; title: string; message: string; onCancel: () => void; onConfirm: () => void; confirmLabel?: string }) {
  return <Modal open={open} title={title} onClose={onCancel} description={message}>
    <div className="flex justify-end gap-2"><Button onClick={onCancel}>Cancelar</Button><Button variant="danger" onClick={onConfirm}>{confirmLabel}</Button></div>
  </Modal>;
}
