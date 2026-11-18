import { useState, type ReactNode } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { InlineError } from '@/components/ui/States';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<unknown>;
  title: string;
  body: ReactNode;
  actionLabel: string;
  /** When set, the user must type this exactly before confirming. */
  confirmText?: string;
  danger?: boolean;
}

export function ConfirmDialog({ open, onClose, onConfirm, title, body, actionLabel, confirmText, danger = true }: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const close = () => {
    setTyped('');
    setError(null);
    onClose();
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      close();
    } catch (e) {
      if (!(e instanceof Error && 'code' in e && (e as { code: string }).code === 'REAUTH_CANCELLED')) setError(e);
    } finally {
      setBusy(false);
    }
  };

  const blocked = confirmText !== undefined && typed.trim() !== confirmText;

  return (
    <Modal
      open={open}
      onClose={close}
      size="sm"
      title={title}
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={confirm} loading={busy} disabled={blocked}>
            {actionLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="text-muted">{body}</div>
        {confirmText !== undefined && (
          <Field label={`Type ${confirmText} to confirm`}>
            {(id) => <Input id={id} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoFocus />}
          </Field>
        )}
        <InlineError error={error} />
      </div>
    </Modal>
  );
}