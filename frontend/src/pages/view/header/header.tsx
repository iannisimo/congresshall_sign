import { requestFullScreen } from "../../../_utils/utils";
import logo from "../../../assets/logo-small.svg"
import Clock from "./clock";

const Header = () => {
    return (
        <>
            <div className="w-full h-32 relative flex flex-row justify-center box-border bg-slate-50">
                <div className="w-[40%] h-full left-0 absolute flex flex-col justify-center">
                    <span className="px-5 py-2 w-full h-fit text-6xl truncate align-top text-primary-900">Centro Congressi</span>
                </div>
                <div className="w-[20%] h-full py-4 flex align-middle justify-center">
                    <img src={logo} alt="Logo" onClick={requestFullScreen}/>
                </div>
                <div className="w-[40%] h-full right-0 absolute ">
                    <Clock className="truncate px-5 py-2"></Clock>
                </div>

                <span className="w-full h-1 bg-primary-900 absolute bottom-0"></span>
            </div>
        </>
    )
};

export default Header;