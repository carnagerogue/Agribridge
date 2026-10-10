import { lazy, Suspense, Component, type ReactNode } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Link,
  useLocation,
} from "react-router-dom";
import { AppProvider, useApp } from "./context/AppContext";
import { Shell } from "./components/Shell";
import { Empty } from "./components/ui";
import Auth from "./pages/Auth";
import PasswordChange from "./pages/PasswordChange";
const Home = lazy(() => import("./pages/Home"));
const Farms = lazy(() => import("./pages/Farms"));
const Settings = lazy(() => import("./pages/Settings"));
const Landing = lazy(() => import("./pages/Landing"));
const Learn = lazy(() => import("./pages/Learn"));
const LessonReader = lazy(() =>
  import("./pages/Learn").then((module) => ({ default: module.LessonReader })),
);
const Weather = lazy(() => import("./pages/Weather"));
const Markets = lazy(() => import("./pages/Markets"));
const Community = lazy(() => import("./pages/Community"));
const CRM = lazy(() => import("./pages/CRM"));
const Trade = lazy(() => import("./pages/Trade"));
const Messages = lazy(() => import("./pages/Messages"));
const Admin = lazy(() => import("./pages/Admin"));
const Assistant = lazy(() => import("./pages/Assistant"));
const Seasons = lazy(() => import("./pages/Seasons"));
const Harvest = lazy(() => import("./pages/Harvest"));
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    if (this.state.error)
      return (
        <div className="fatal-error">
          <h1>Let’s reconnect.</h1>
          <p>
            Agribridge could not open this view. Your server records remain
            saved.
          </p>
          <button
            className="button button-primary"
            onClick={() => window.location.reload()}
          >
            Reload workspace
          </button>
        </div>
      );
    return this.props.children;
  }
}
function Staff({ children }: { children: ReactNode }) {
  const { user } = useApp();
  return user?.role === "farmer" ? <Navigate to="/" replace /> : children;
}
function Application() {
  const { user, loading } = useApp();
  const location = useLocation();
  if (loading)
    return (
      <div className="initial-loading">
        <img src="/icon.svg" width="48" height="48" alt="" />
        <p>Opening Agribridge…</p>
      </div>
    );
  if (location.pathname === "/welcome" || (!user && location.pathname === "/"))
    return (
      <Suspense
        fallback={
          <div className="initial-loading">
            <p>Opening Agribridge…</p>
          </div>
        }
      >
        <Landing />
      </Suspense>
    );
  if (!user) return <Auth />;
  if (user.passwordChangeRequired) return <PasswordChange />;
  if (location.pathname === "/login") return <Navigate to="/" replace />;
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Home />} />
        <Route path="farms" element={<Farms />} />
        <Route path="seasons" element={<Seasons />} />
        <Route path="harvest" element={<Harvest />} />
        <Route path="weather" element={<Weather />} />
        <Route path="markets" element={<Markets />} />
        <Route path="learn" element={<Learn />} />
        <Route path="learn/:id" element={<LessonReader />} />
        <Route path="community" element={<Community />} />
        <Route path="assistant" element={<Assistant />} />
        <Route
          path="crm"
          element={
            <Staff>
              <CRM />
            </Staff>
          }
        />
        <Route
          path="trade"
          element={
            <Staff>
              <Trade />
            </Staff>
          }
        />
        <Route
          path="messages"
          element={
            <Staff>
              <Messages />
            </Staff>
          }
        />
        <Route
          path="admin"
          element={
            <Staff>
              <Admin />
            </Staff>
          }
        />
        <Route path="settings" element={<Settings />} />
        <Route
          path="*"
          element={
            <Empty
              title="This page has moved."
              body="Your workspace is still right here."
              action={
                <Link className="button button-primary" to="/">
                  Back to Home
                </Link>
              }
            />
          }
        />
      </Route>
    </Routes>
  );
}
export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppProvider>
          <Application />
        </AppProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
