import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { tryApiFetch } from '@/lib/api';
import { formatDate, formatRole } from '@/lib/format';
import type { CatalogSummary, MembersResponse } from '@/lib/types';
import { InviteForm } from './invite-form';

export const metadata: Metadata = {
  title: 'Equipo',
};

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const [members, catalogs] = await Promise.all([
    tryApiFetch<MembersResponse>('/users'),
    tryApiFetch<{ items: CatalogSummary[] }>('/catalogs'),
  ]);

  if (!members) {
    return (
      <div>
        <header className="page-head">
          <div>
            <span className="eyebrow">Equipo</span>
            <h1 className="display">
              Sólo para <em>administradores</em>.
            </h1>
            <p>
              Tu rol actual no incluye <code>user:manage</code>. Pedile a un administrador de la
              organización que te asigne el permiso.
            </p>
          </div>
        </header>
        <div className="empty">
          <span className="empty__mark">403</span>
          <h3>Permiso insuficiente</h3>
          <p>La API respondió con un alcance menor al necesario para listar el equipo.</p>
        </div>
      </div>
    );
  }

  const active = members.items.filter((member) => member.status === 'ACTIVE').length;
  const invited = members.items.filter((member) => member.status === 'INVITED').length;
  const roles = members.roles.filter(
    (role) => role.key !== 'customer' && role.key !== 'superadmin',
  );

  return (
    <div>
      <header className="page-head">
        <div>
          <span className="eyebrow">Equipo y permisos</span>
          <h1 className="display">
            La mesa <em>completa</em>.
          </h1>
          <p>
            Invitá colaboradores con un rol atómico y un alcance de organización o catálogo. La
            invitación vence en 7 días y sólo puede usarse una vez.
          </p>
        </div>
        <div className="page-head__aside">
          <strong>{active}</strong>
          <span>activos · {invited} invitados</span>
        </div>
      </header>

      <div className="invite-grid">
        <section className="panel">
          <div className="panel__head">
            <h2>Miembros</h2>
            <span className="mono faint">{members.items.length} registros</span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Roles</th>
                  <th>Estado</th>
                  <th>Alta</th>
                </tr>
              </thead>
              <tbody>
                {members.items.map((member, index) => (
                  <tr
                    key={member.id}
                    className="rise"
                    style={{ '--i': index } as CSSProperties}
                  >
                    <td>
                      <span className="table__primary">
                        <strong>{member.fullName}</strong>
                        <span>{member.email}</span>
                      </span>
                    </td>
                    <td>
                      <span className="chip-row">
                        {member.roleKeys.length > 0 ? (
                          member.roleKeys.map((role) => (
                            <span className="badge" key={role}>
                              {formatRole(role)}
                            </span>
                          ))
                        ) : (
                          <span className="badge">Sin rol</span>
                        )}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge ${member.status === 'ACTIVE' ? 'badge--ok' : 'badge--warn'}`}
                      >
                        {member.status === 'ACTIVE' ? 'Activo' : member.status.toLowerCase()}
                      </span>
                    </td>
                    <td className="table__num">{formatDate(member.joinedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="panel__foot">
            Los permisos efectivos se resuelven por rol + scope en cada request.
          </div>
        </section>

        <InviteForm roles={roles} catalogs={catalogs?.items ?? []} />
      </div>
    </div>
  );
}
