import { useAuth } from "../../../_utils/auth/authProvider";
import { useDate } from "../../../_utils/date";
import Popup from 'reactjs-popup';
import Calendar from 'react-calendar';
import './Calendar.css';
import { format, startOfDay } from 'date-fns'
import { useEffect } from "react";

const Clock = ({ className }: { className?: string | null }) => {
  const { date, setBaseDate } = useDate();
  const { token } = useAuth();

  const hour = () => format(date, "hh")
  const minute = () => format(date, "mm")
  const pm = () => format(date, "a")

  return (
    <>
      <Popup disabled={!token} trigger={
        <div className={`${className} h-full w-full flex justify-end items-center text-primary-900 tracking-widest`}>
          <div className="flex items-end">
            <span className={`mr-4 text-4xl ${token ? "" : "hidden"}`}>{date.toLocaleDateString('it-IT', { day: "2-digit", month: "2-digit", year: "numeric" })}</span>
            <span className="text-7xl tracking-widest">{hour()}</span>
            <span className="text-7xl px-2">:</span>
            <span className="text-7xl tracking-widest">{minute()}</span>
            <span className="text-4xl">{pm()}</span>
          </div>
        </div>
      }>
        <>
          <Calendar value={date} onClickDay={(value, _) => { setBaseDate(startOfDay(value)) }} tileDisabled={({ date }) => (date.valueOf() - new Date().valueOf() + 86400000 <= 0)} />
        </>
      </Popup>
    </>
  );
};

export default Clock;
