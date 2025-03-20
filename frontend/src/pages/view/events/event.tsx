import { useDate } from "../../../_utils/date"
import clock_svg from "../../../assets/time/clock.svg"
// import hourglass_start_svg from "../../../assets/time/hourglass_start.svg"
// import hourglass_end_svg from "../../../assets/time/hourglass_end.svg"
import { IEvent, useWS } from "../../../_utils/websocket/websoket"
import { pDate, pTime } from "../../../_utils/utils"
import { useAuth } from "../../../_utils/auth/authProvider"
import { useState } from "react"
import Popup from "reactjs-popup"
import { PencilSquare, Person, XLg, Clock, HourglassBottom, HourglassTop, HourglassSplit, Check2Circle } from "react-bootstrap-icons"
import NewEvent from "./new/new"
import { addMilliseconds, closestIndexTo, differenceInMilliseconds } from 'date-fns'

const Event = ({ event, collapsed = false }: { event: IEvent, collapsed?: boolean }) => {

  const { getRooms, deleteEvent } = useWS();
  const room_names = getRooms(event.room_ids)?.map((room) => (room.name)).join(', ')
  const [popup, setPopup] = useState<boolean>(false);

  const { date } = useDate();
  const { token } = useAuth()

  const in_progress = () => ((!event.start_time || !event.end_time) ? false : (date.valueOf() >= event.start_time.valueOf() && date.valueOf() <= event.end_time.valueOf()));
  // const nearing_end = () => ((!event.start_time || !event.end_time) ? false : (date.valueOf() - event.start_time.valueOf()) >= (event.end_time.valueOf() - date.valueOf()));

  const stateIcon = () => {
    const size = "60";
    if (!event.start_time || !event.end_time) return <Clock size={size} />;
    switch (closestIndexTo(date, [
      addMilliseconds(event.start_time, -1),
      event.start_time,
      addMilliseconds(event.start_time, differenceInMilliseconds(event.end_time, event.start_time) / 2),
      event.end_time,
      addMilliseconds(event.end_time, 1)
    ])) {
      case 0:
        return (<><Clock size={size} /></>)
      case 1:
        return (<><HourglassTop size={size} /></>)
      case 2:
        return (<><HourglassSplit size={size} /></>)
      case 3:
        return (<><HourglassBottom size={size} /></>)
      case 4:
        return (<><Check2Circle size={size} /></>)
    }
    return (<Clock size={10} />)
  }

  if (!collapsed)
    return (
      <>
        <div className={`w-full h-40 rounded-lg my-2 bg-gray-300 flex flex-row -order-1 relative group`}>
          <div className="w-fit h-full flex flex-row box-border items-center justify-evenly space-x-4 px-4" >
            {stateIcon()}
            {event.logo
              ? <img className="w-32 h-32" src={`/api/logo/get/${event.logo}`} />
              : <div className="bg-gray-400 rounded-full h-32 w-32 bg-clip-content flex justify-center items-center"><Person className="mx-3 mb-5 mt-2 size-28" /></div>
            }

          </div>
          <div className="flex flex-col justify-between px-5 py-3 items-start w-[45%]">
            <div>
              <span className=" mt-1 mb-3 font-bold text-2xl truncate w-[100%] h-auto" >{room_names ?? ""} </span>
            </div>
            <div className="flex flex-col justify-evenly mt-auto">
              <span className=" text-xl truncate w-[100%] h-auto" >{event.org} </span>
              <span className={` text-xl truncate w-[100%] h-auto`}>{event.title} </span>
              <span className={` text-xl truncate w-[100%] h-auto font-light ${event.subtitle ? "" : "hidden"}`} >{event.subtitle} </span>
              <span className="w-full h-3" />
            </div>
          </div>
          <div className="flex flex-col justify-center items-end w-[25%] ml-auto mr-5">
            <span className={`truncate text-2xl font-mono ${in_progress() ? "hidden" : ""}`}>{pDate(event.start_time)}</span>
            <span className="truncate text-2xl">{in_progress() ? "In corso" : `Inizio: ${pTime(event.start_time)}`}</span>
            <span className="truncate text-2xl">Fine: {pTime(event.end_time)}</span>
          </div>
          {
            token
              ? <div className="absolute top-2 right-2 flex flex-row justify-center items-center space-x-2 h-fit w-fit collapse group-hover:visible">
                <button onClick={() => setPopup(true)} title="Modifica"><PencilSquare size={20} /></button>
                <Popup repositionOnResize={false} closeOnEscape={false} modal open={popup}>
                  <NewEvent _event={event} close={() => setPopup(false)} />
                </Popup>
                <button onClick={() => deleteEvent(event._id ?? "")} title="Cancella"><XLg size={20} /></button>
              </div>
              : <></>
          }

        </div>
      </>
    )
  return (
    <>
      <div className={`w-full h-12 rounded-lg my-2 bg-gray-300 flex flex-row items-center place order-1`}>
        <div className="w-fit h-full flex flex-row box-border items-center justify-evenly" >
          <img className="p-11 h-28" src={clock_svg} />
        </div>
        <span className="text-lg py-2 truncate px-5 font-semibold">{event.org}</span>
        <span className="text-lg py-2 truncate px-5">{event.title}</span>
        <span className="text-lg py-2 truncate px-5 ml-auto">{pDate(event.start_time)}</span>
        <span className="text-lg py-2 truncate px-5">{pTime(event.start_time)}</span>
      </div>
    </>
  );
};

export default Event;
