import { BrowserRouter, Routes, Route } from "react-router";
import Login from "./pages/login"
import NoPage from "./pages/nopage"
import { ProtectedRoute } from "./_utils/auth/protectedRoute"
import Logout from "./pages/logout";
import View from "./pages/view/view";
// import Dashboard from "./pages/dashboard/dashboard";
import NewEvent from "./pages/view/events/new/new";


const Router = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ProtectedRoute />} >
          <Route path='logout' element={<Logout />} />
        </Route>
        <Route path="/">
          <Route index element={<View />} />
          <Route path='login' element={<Login />} />
          <Route path="test" element={<NewEvent />} />
          <Route path='*' element={<NoPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
};

export default Router;
