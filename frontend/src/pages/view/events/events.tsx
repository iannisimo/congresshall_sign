import Popup from "reactjs-popup";
import { useAuth } from "../../../_utils/auth/authProvider";
import { PlusLg } from "react-bootstrap-icons"
import Event from "./event"
import NewEvent from "./new/new";
import { IEvent, useWS } from "../../../_utils/websocket/websoket";
import { addDays } from "date-fns"
import { useState } from "react";

const Events = () => {

    const { token } = useAuth();
    const [popup, setPopup] = useState<boolean>(false);
    const { events } = useWS();

    return (
        <>
            <div className={`w-full h-full ${token ? "overflow-scroll" : "overflow-hidden"} px-5 py-2 flex flex-col flex-nowrap relative`}>
                {events.map((event: IEvent, index: number) => (
                    <Event event={event} key={event._id} collapsed={!token && (index >= 1 || (event.start_time ?? new Date()) > addDays(new Date(), 2))} />
                ))}
                <span className="order-0 mt-auto" />
                {token ? 
                    <>
                        <button onClick={() =>setPopup(true)} className="w-14 h-14 min-w-14 min-h-14 rounded-full bg-primary-100 hover:bg-primary-200 cursor-pointer sticky bottom-4 ml-auto right-4 flex justify-center items-center shadow-lg">
                            <PlusLg className="w-full f-full" size="36" />
                        </button>
                        <Popup repositionOnResize={false} modal closeOnEscape={false} open={popup}>
                            <NewEvent close={() => setPopup(false)}/>
                        </Popup>
                    
                    </>
                    : <></>
                }
            </div>
        </>
    );
};

export default Events;