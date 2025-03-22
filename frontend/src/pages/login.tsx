import { useAuth } from '../_utils/auth/authProvider'
import { useNavigate } from 'react-router';
import axios from 'axios';



const Login = () => {
  const { setToken } = useAuth();
  const navigate = useNavigate();

  const login_form = async (form: FormData) => {
    axios.post('/api/login', form, {
      headers: {
        'Content-Type': 'application/json'
      }
    }).then((res) => {
      if (!res.data.token) throw null;
      setToken(res.data.token);
      navigate('/')
    }).catch((_) => {
    });
  };

  return (
    <>
      <form method='POST' action={login_form}>
        <div className="bg-white px-10 py-8 rounded-xl w-screen shadow-xl max-w-sm space-y-4">
          <h1 className="text-center px-10 py-4 text-2xl font-semibold ">Login</h1>
          <hr />
          <div className="flex items-center border-2 py-2 px-3 rounded-md mb-4">
            <input className="pl-2 outline-none border-none w-full" name="username" placeholder="Username" required />
          </div>
          <div className="flex items-center border-2 py-2 px-3 rounded-md mb-4">
            <input className="pl-2 outline-none border-none w-full" name="password" type="password" placeholder="Password" required />
          </div>
          <hr />
          <button type="submit" value="login" id="login" className="mt-6 w-full shadow-xl bg-primary-300 hover:bg-primary-400 py-2 rounded-md text-lg tracking-wide transition duration-100">Login</button>
        </div>
      </form>
    </>
  )
}

export default Login;
