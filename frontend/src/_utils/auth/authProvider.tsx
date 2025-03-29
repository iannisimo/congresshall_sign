import axios from "axios";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

interface IContext {
  token: string | null;
  setToken: (newToken: string | null) => void;
}


const AuthContext = createContext({} as IContext);

const AuthProvider = ({ children }: any) => {
  // State to hold the authentication token
  const [token, setToken_] = useState(localStorage.getItem("token"));

  // Function to set the authentication token
  const setToken = (newToken: string | null) => {
    const newToken_ = newToken ? newToken : null;
    setToken_(newToken_);
  };

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common["Authorization"] = "Bearer " + token;
      localStorage.setItem('token', token);
      axios.get('/api/testauth').catch(() => {
        console.log('a');
        setToken(null);
        window.location.assign('/login');
      });
    } else {
      delete axios.defaults.headers.common["Authorization"];
      localStorage.removeItem('token')
    }
  }, [token]);

  // Memoized value of the authentication context
  const contextValue = useMemo(
    () => ({
      token,
      setToken,
    }),
    [token]
  );

  // Provide the authentication context to the children components
  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};

export default AuthProvider;
