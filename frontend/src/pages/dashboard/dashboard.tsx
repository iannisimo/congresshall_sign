import Header from "../view/header/header";
import Events from "../view/events/events";
import Footer from "./footer";

const Dashboard = () => {
    return (
        <>
            <div className="h-screen w-screen flex flex-col items-center justify-start">
                <Header/>
                <Events/>
                <Footer/>
            </div>
        </>
    )
};

export default Dashboard;