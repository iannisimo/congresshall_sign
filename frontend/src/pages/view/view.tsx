import Header from "./header/header";
import Events from "./events/events";
import Footer from "./footer/footer";

const View = () => {

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

export default View;