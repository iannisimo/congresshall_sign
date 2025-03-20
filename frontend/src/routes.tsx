import { BrowserRouter, Routes, Route } from "react-router";
import Login from "./pages/login"
import NoPage from "./pages/nopage"
import { ProtectedRoute } from "./_utils/auth/protectedRoute"
import App from "./App"
import Logout from "./pages/logout";
import View from "./pages/view/view";
import Dashboard from "./pages/dashboard/dashboard";
import NewEvent from "./pages/view/events/new/new";


const Router = () => {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<ProtectedRoute />} >
            <Route path='logout' element={<Logout />} />
            <Route path="app" element={<App />} />
            <Route path="dashboard" element={<Dashboard />} />
          </Route>
          <Route path="/">
            <Route path='login' element={<Login />} />
            <Route path="view" element={<View />} />
            <Route path="test" element={<NewEvent />} />
            <Route path="*" element={<NoPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    )
};

export default Router;