import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import AuthGuard from "@/crm/AuthGuard";
import CrmLayout from "@/crm/CrmLayout";
import LoginPage from "@/crm/auth/LoginPage";
import DashboardPage from "@/crm/dashboard/DashboardPage";
import PeoplePage from "@/crm/people/PeoplePage";
import PersonDetailPage from "@/crm/people/PersonDetailPage";
import OrganisationsPage from "@/crm/orgs/OrganisationsPage";
import OrganisationDetailPage from "@/crm/orgs/OrganisationDetailPage";
import PipelinePage from "@/crm/pipeline/PipelinePage";
import EventsPage from "@/crm/events/EventsPage";
import EventDetailPage from "@/crm/events/EventDetailPage";
import TeamPage from "@/crm/team/TeamPage";
import OnboardingPage from "@/crm/auth/OnboardingPage";
import ModuleGuard from "@/crm/shared/components/ModuleGuard";
import { InviteLinkRedirect } from "@/crm/auth/InviteLinkRedirect";
import JoinPage from "@/public/JoinPage";
import SubmissionsPage from "@/crm/people/SubmissionsPage";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

/**
 * HashRouter (not BrowserRouter) because the CRM is a static SPA on GitHub
 * Pages, which has no server to rewrite deep links back to index.html.
 */
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <HashRouter>
          <InviteLinkRedirect />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/join" element={<JoinPage />} />
            <Route element={<AuthGuard />}>
              <Route path="onboarding" element={<OnboardingPage />} />
              <Route element={<CrmLayout />}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route element={<ModuleGuard module="dashboard" />}>
                  <Route path="dashboard" element={<DashboardPage />} />
                </Route>
                <Route element={<ModuleGuard module="people" />}>
                  <Route path="people" element={<PeoplePage />} />
                  <Route path="people/submissions" element={<SubmissionsPage />} />
                  <Route path="people/:id" element={<PersonDetailPage />} />
                </Route>
                <Route element={<ModuleGuard module="organisations" />}>
                  <Route path="organisations" element={<OrganisationsPage />} />
                  <Route path="organisations/:id" element={<OrganisationDetailPage />} />
                </Route>
                <Route element={<ModuleGuard module="pipeline" />}>
                  <Route path="pipeline" element={<PipelinePage />} />
                </Route>
                <Route element={<ModuleGuard module="events" />}>
                  <Route path="events" element={<EventsPage />} />
                  <Route path="events/:id" element={<EventDetailPage />} />
                </Route>
                <Route element={<ModuleGuard module="team" />}>
                  <Route path="team" element={<TeamPage />} />
                </Route>
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Route>
            </Route>
          </Routes>
        </HashRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
