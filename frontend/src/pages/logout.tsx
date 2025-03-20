import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../_utils/auth/authProvider";

const Logout = () => {
  const { setToken } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    setToken(null);
    navigate("/", { replace: true });
  });

  return <></>;
};

export default Logout;
