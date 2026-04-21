import { useEffect, useState } from 'react';
import MonitoringChart from '../components/MonitoringChart';
import { useAppContext } from '../context/AppContext';

export default function Monitoring() {
  const { monitoringResult, getMonitoringData, runMonitoringSimulation } = useAppContext();
  const [loading, setLoading] = useState(false);
  const [simulating, setSimulating] = useState(false);

  useEffect(() => {
    if (!monitoringResult && !loading) {
      setLoading(true);
      getMonitoringData().finally(() => setLoading(false));
    }
  }, [monitoringResult, loading, getMonitoringData]);

  const handleSimulate = async () => {
    setSimulating(true);
    await runMonitoringSimulation();
    setSimulating(false);
  };

  if (loading || !monitoringResult) {
    return <div className="card" style={{ padding: 40, textAlign: 'center' }}>Loading monitoring tracking data...</div>;
  }

  const { events, current_risk_level, trend } = monitoringResult;
  const current = events[events.length - 1] || { fairness_score: 0, alert: false };
  const status = current_risk_level || 'Green';

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="kicker">Monitoring</div>
          <h1 className="page-title">Live fairness tracking after deployment</h1>
        </div>
        <button className="btn btn-primary" onClick={handleSimulate} disabled={simulating}>
          {simulating ? 'Simulating...' : 'Simulate 30 days of monitoring'}
        </button>
      </div>

      <div className="grid-3" style={{ marginBottom: 16 }}>
        <div className="card"><div className="section-title">Current score</div><div className="stat-number">{current.fairness_score}</div></div>
        <div className="card"><div className="section-title">Trend</div><div className="stat-number" style={{ textTransform: 'capitalize' }}>{trend}</div></div>
        <div className="card"><div className="section-title">Current status</div><span className={`pill ${status.toLowerCase()}`}>{status}</span></div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">Fairness score over time</div>
        {events && events.length > 0 ? (
          <MonitoringChart events={events} />
        ) : (
          <div className="helper">No monitoring events recorded yet.</div>
        )}
      </div>

      <div className="card">
        <div className="section-title">Alert log</div>
        <div className="notice-list">
          {events && events.filter((event: any) => event.alert).length === 0 && <div className="helper">No alerts generated.</div>}
          {events && events.filter((event: any) => event.alert).slice(0, 5).map((event: any) => (
            <div className="notice" key={event.timestamp}>
              <strong>{new Date(event.timestamp).toLocaleString()}</strong>
              <div className="helper">{event.note}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
