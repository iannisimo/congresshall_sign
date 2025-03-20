import { useWS } from "../../../_utils/websocket/websoket";
import Card from "./card"

const Footer = () => {
    const { main_rooms, sub_rooms } = useWS();

    return (
        <>
            <div className="mt-auto w-full h-32 relative flex flex-row justify-center box-border z-10 bg-slate-100 space-x-4">
                <span className="w-full h-1 bg-primary-900 absolute top-0"></span>
                <div className="flex flex-row h-full w-full justify-evenly items-center">
                    {main_rooms().map((room) => (
                        <Card key={room._id} room={room} />
                    ))}
                </div>
                <span className="w-1 h-full bg-primary-900 mx-8"/>
                <div className="flex flex-row h-full w-fit justify-evenly items-center px-10">
                    {sub_rooms().map((room) => (
                        <Card key={room._id} room={room} />
                    ))}
                </div>
            </div>
        </>
    )
};

export default Footer;