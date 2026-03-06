import { BrowserRouter, Route, Routes } from "react-router-dom";

import NavBar from "./components/NavBar";
import ActivityPage from "./pages/ActivityPage";
import AgentsPage from "./pages/AgentsPage";
import FederationPage from "./pages/FederationPage";
import OrgChartPage from "./pages/OrgChartPage";
import TeamsPage from "./pages/TeamsPage";
import ControlPlanePage from "./pages/ControlPlanePage";
import ProjectsPage from "./pages/ProjectsPage";
import SchedulePage from "./pages/SchedulePage";
import StatusPage from "./pages/StatusPage";
import TokensPage from "./pages/TokensPage";

export default function App() {
  return (
    <BrowserRouter>
      <main className="mx-auto max-w-[1800px] p-4 lg:p-6">
        <NavBar />
        <Routes>
          <Route path="/" element={<StatusPage />} />
          <Route path="/tasks" element={<ControlPlanePage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:projectId" element={<ProjectsPage />} />
          <Route path="/boards/:boardId" element={<ControlPlanePage />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/tokens" element={<TokensPage />} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/teams" element={<TeamsPage />} />
          <Route path="/federation" element={<FederationPage />} />
        <Route path="/org" element={<OrgChartPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
