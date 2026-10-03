import { Card } from "@retexia/ui";
import type { ReactNode } from "react";

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6 sm:p-8">
        <div className="mb-6 flex flex-col gap-2 text-center">
          <h1 className="type-h1 text-ink">{title}</h1>
          {subtitle ? <div className="type-body text-ink-muted">{subtitle}</div> : null}
        </div>
        {children}
      </Card>
      {footer ? <div className="text-center type-body text-ink-muted">{footer}</div> : null}
    </div>
  );
}
