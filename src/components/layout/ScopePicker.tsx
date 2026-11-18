import { useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import { usePreferences } from '@/store/preferences';
import { Select } from '@/components/ui/Field';

/** Global Application and Environment filter shared by every module. */
export function ScopePicker() {
  const { applicationId, environmentId, setScope } = usePreferences();
  const { data: apps = [] } = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const app = apps.find((a) => a.id === applicationId);

  return (
    <div className="flex min-w-0 items-center gap-2">
      <label className="sr-only" htmlFor="scope-app">
        Application
      </label>
      <Select id="scope-app" value={app?.id ?? ''} onChange={(e) => setScope(e.target.value || null)} className="h-8 w-44 text-xs sm:w-52">
        <option value="">All applications</option>
        {apps
          .filter((a) => a.status === 'active')
          .map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
      </Select>
      {app && (
        <>
          <label className="sr-only" htmlFor="scope-env">
            Environment
          </label>
          <Select id="scope-env" value={environmentId ?? ''} onChange={(e) => setScope(app.id, e.target.value || null)} className="hidden h-8 w-36 text-xs sm:block">
            <option value="">All environments</option>
            {app.environments.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
        </>
      )}
    </div>
  );
}