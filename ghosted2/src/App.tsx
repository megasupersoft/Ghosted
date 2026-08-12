import AgentGraph from './components/AgentGraph';
import { ChatView } from './components/ChatView';
import { Sidebar } from './components/Sidebar';
import { useStore } from './store';

export default function App() {
  const sessions = useStore((s) => s.sessions);
  const updates = useStore((s) => s.updates);
  const pendingPermissions = useStore((s) => s.pendingPermissions);
  const selectedSessionId = useStore((s) => s.selectedSessionId);
  const selectSession = useStore((s) => s.selectSession);

  return (
    <div className="app-shell">
      <Sidebar />
      <ChatView />
      <div className="right-col">
        <AgentGraph
          sessions={sessions}
          updates={updates}
          pendingPermissions={pendingPermissions}
          selectedSessionId={selectedSessionId}
          onSelectSession={selectSession}
        />
      </div>
    </div>
  );
}
