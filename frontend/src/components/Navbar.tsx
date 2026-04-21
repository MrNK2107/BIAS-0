import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
};

export default function Navbar({ items, activePath }: { items: NavItem[]; activePath: string }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-badge">◈</div>
        <div>
          <strong>Unbiased AI</strong>
          <span>FAIRNESS SUITE</span>
        </div>
      </div>
      <div className="nav-group">
        <div className="nav-label">Workspace</div>
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activePath === item.to;
          return (
            <Link key={item.to} to={item.to} className={`nav-link ${isActive ? 'active' : ''}`}>
              <Icon size={16} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
