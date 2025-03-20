import { useState } from "react";
import { Room, RoomOccupancy, useWS } from "../../../_utils/websocket/websoket";
import { useAuth } from "../../../_utils/auth/authProvider";
import Popup from "reactjs-popup";

const Card = ({room}: {room: Room}) => {
    
    const [ popup, _setPopup ] = useState<boolean>(false);
    const [ newMessage, setNewMessage ] = useState<string | undefined>(undefined);
    const { token } = useAuth();
    const { setRoom } = useWS();

    const setPopup = (_popup: boolean) => {
        if (!_popup) {
            setNewMessage(undefined)
        }
        _setPopup(_popup)
    }

    const editable = () => (token && room.cur_status !== RoomOccupancy.OCCUPIED);
    const newState = () => (room.cur_status === RoomOccupancy.FREE ? RoomOccupancy.WARN : RoomOccupancy.FREE);

    const occ_text = (occ?: RoomOccupancy) => {
        switch (occ) {
            case undefined:
            case RoomOccupancy.FREE:
                return "Libero";
            case RoomOccupancy.OCCUPIED:
                return "Occupato";
            case RoomOccupancy.WARN:
                return room.custom_message ?? room.sub_msg ?? "Non Disponibile"  
            default:
                break;
        }
    };

    const occ_color = (occ?: RoomOccupancy) => {
        switch (occ) {
            case undefined:
            case RoomOccupancy.FREE:
                return "bg-success";
            case RoomOccupancy.OCCUPIED:
                return "bg-error";
            case RoomOccupancy.WARN:
                return "bg-warning"
            default:
                break;
        }
    }

    return (
        <>
            <div className="w-[22vw] h-32 py-4 mx-2">
                <div className="rounded-3xl bg-gray-300 shadow-2xl w-full h-full px-5 py-3 flex flex-col justify-around relative">
                    <span className="text-3xl tracking-wider pr-6 text-ellipsis truncate">{room.name}</span>
                    <span className="text-2xl tracking-wider text-ellipsis truncate">{popup ? newMessage ?? occ_text(newState()) : occ_text(room.cur_status)}</span>
                    <span onClick={() => {if(token) setPopup(!popup)}} className={`w-8 h-8 ${editable() && "cursor-pointer"} rounded-full absolute drop-shadow-md top-3 right-3 ${occ_color(popup ? newState() : room.cur_status)}`} />
                </div>
            </div>
            <Popup open={popup} closeOnDocumentClick={false} closeOnEscape={false}>
                <div className="w-fit h-fit flex flex-col justify-center items-center bg-white rounded-lg p-4">
                    <span className="text-2xl">{room.name}</span>

                    <div className="flex items-center border-2 rounded-md mt-3">
                        <input onChange={(ev: React.ChangeEvent<HTMLInputElement>) => {setNewMessage(ev.target.value)}} className="pl-2 outline-none border-none w-full text-xl" disabled={newState() === RoomOccupancy.FREE} name="new_state" defaultValue={occ_text(newState())}/>
                    </div>
                    
                    <div className="flex flex-row w-full justify-end items-center space-x-2">
                        <button onClick={() => setPopup(false)} className="mt-6 w-full shadow-xl bg-primary-300 hover:bg-primary-400 py-2 rounded-md text-lg tracking-wide transition duration-100">Cancella</button>
                        <button onClick={() => {setRoom(room._id, {cur_status: newState(), custom_message: newMessage}); setPopup(false)}} className="mt-6 w-full shadow-xl bg-primary-300 hover:bg-primary-400 py-2 rounded-md text-lg tracking-wide transition duration-100">Salva</button>
                    </div>
                </div>
            </Popup>
        </>  
    );
};

export default Card;