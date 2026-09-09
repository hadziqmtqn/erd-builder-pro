import type { ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useTeams } from '@/hooks/useTeams';
import { TableRoute } from '@/routes/TableRoute';

type Capability = 'erd_builder' | 'notes' | 'drawings' | 'flowcharts' | 'desktop_only';

const TABLE_CAPABILITIES: Record<string, Capability> = {
  erd: 'erd_builder',
  notes: 'notes',
  drawings: 'drawings',
  flowchart: 'flowcharts',
  flowcharts: 'flowcharts',
  'db-client': 'desktop_only',
};

const LABELS: Record<Capability, string> = {
  erd_builder: 'ERD Builder',
  notes: 'Notes',
  drawings: 'Drawings',
  flowcharts: 'Flowcharts',
  desktop_only: 'DB Client',
};

function CloudFeatureUnavailable({ capability, teamName, ssoPortalUrl }: { capability: Capability; teamName?: string; ssoPortalUrl?: string | null }) {
  const navigate = useNavigate();
  const feature = LABELS[capability];
  const openCloudPricing = () => {
    if (!ssoPortalUrl) return;
    try {
      window.location.assign(new URL('/pricing#cloud-saas', ssoPortalUrl).toString());
    } catch {
      // Keep the unavailable state visible when deployment configuration is malformed.
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-10">
      <section className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <CircleAlert className="size-5" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h1 className="text-base font-semibold text-foreground">Unlock {feature}</h1>
            <p className="text-sm leading-6 text-muted-foreground">
              {feature} is not included in {teamName || 'this Team'}&apos;s current Cloud plan. Upgrade to continue using it.
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end border-t border-border pt-4">
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/')}>Return to dashboard</Button>
            {ssoPortalUrl && <Button onClick={openCloudPricing}>View Cloud plans</Button>}
          </div>
        </div>
      </section>
    </div>
  );
}

export function CloudFeatureRoute({ capability, children }: { capability: Capability; children: ReactNode }) {
  const { user, isGuest } = useAuth();
  const { activeTeamId, activeTeam, isLoading } = useTeams(isGuest);

  if (!user?.isSso || !activeTeamId) return <>{children}</>;
  if (isLoading) return <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Checking Team plan…</div>;

  const allowed = capability !== 'desktop_only' && activeTeam?.capabilities?.[capability] === true;
  if (allowed) return <>{children}</>;

  return <CloudFeatureUnavailable capability={capability} teamName={activeTeam?.name} ssoPortalUrl={user?.ssoPortalUrl ?? user?.sso_portal_url} />;
}

export function CloudTableRoute() {
  const { feature } = useParams<{ feature: string }>();
  const capability = feature ? TABLE_CAPABILITIES[feature] : undefined;

  return capability ? <CloudFeatureRoute capability={capability}><TableRoute /></CloudFeatureRoute> : <TableRoute />;
}
