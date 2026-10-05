import { lazy, Suspense } from "react";
import { createBrowserRouter } from "react-router-dom";
import { Shell } from "./components/Shell";
import { LoadingState } from "./components/LoadingState";
import { AssistantPage } from "./pages/AssistantPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DiscoverPage } from "./pages/DiscoverPage";
import { DocsPage } from "./pages/DocsPage";
import { LandingPage } from "./pages/LandingPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ProjectOverviewPage } from "./pages/ProjectOverviewPage";
import { ProjectActivityPage } from "./pages/ProjectActivityPage";
import { ProjectIntelligencePage } from "./pages/ProjectIntelligencePage";

const WorkspacePage = lazy(() => import("./pages/WorkspacePage").then((module) => ({ default: module.WorkspacePage })));
const ProjectLabsPage = lazy(() => import("./pages/ProjectLabsPage").then((module) => ({ default: module.ProjectLabsPage })));
const ProjectAdvancedPage = lazy(() => import("./pages/ProjectAdvancedPage").then((module) => ({ default: module.ProjectAdvancedPage })));
const ProjectUniversePage = lazy(() => import("./pages/ProjectUniversePage").then((module) => ({ default: module.ProjectUniversePage })));
const ProjectControlRoomPage = lazy(() => import("./pages/ProjectControlRoomPage").then((module) => ({ default: module.ProjectControlRoomPage })));

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Shell />,
    errorElement: <NotFoundPage />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: "discover", element: <DiscoverPage /> },
      { path: "dashboard", element: <DashboardPage /> },
      { path: "docs", element: <DocsPage /> },
      { path: "projects/:projectId", element: <ProjectOverviewPage /> },
      { path: "projects/:projectId/assistant", element: <AssistantPage /> },
      {
        path: "projects/:projectId/workspace",
        element: <Suspense fallback={<LoadingState label="Loading code workspace" />}><WorkspacePage /></Suspense>
      },
      { path: "projects/:projectId/intelligence", element: <ProjectIntelligencePage /> },
      {
        path: "projects/:projectId/control-room",
        element: <Suspense fallback={<LoadingState label="Opening mesh control room" />}><ProjectControlRoomPage /></Suspense>
      },
      {
        path: "projects/:projectId/universe",
        element: <Suspense fallback={<LoadingState label="Entering the code universe" />}><ProjectUniversePage /></Suspense>
      },
      {
        path: "projects/:projectId/labs",
        element: <Suspense fallback={<LoadingState label="Loading engineering labs" />}><ProjectLabsPage /></Suspense>
      },
      {
        path: "projects/:projectId/advanced",
        element: <Suspense fallback={<LoadingState label="Loading advanced operations" />}><ProjectAdvancedPage /></Suspense>
      },
      { path: "projects/:projectId/:section", element: <ProjectActivityPage /> }
    ]
  }
]);
