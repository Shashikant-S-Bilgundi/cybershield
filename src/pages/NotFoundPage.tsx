import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/ui/States';
import { Button } from '@/components/ui/Button';

export function NotFoundPage() {
  return (
    <EmptyState
      title="This page doesn't exist"
      body="The link may be old, or the item was deleted."
      action={
        <Link to="/">
          <Button>Go to the dashboard</Button>
        </Link>
      }
    />
  );
}