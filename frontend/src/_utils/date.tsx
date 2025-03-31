import { useState, createContext, useContext } from "react";
import { addSeconds, differenceInSeconds, startOfDay } from 'date-fns'
import { useInterval } from "./utils";

const UPDATE_INTERVAL = 1000;

interface IContext {
  date: Date;
  baseDate: Date;
  setBaseDate: (newTime: Date) => void;
};

const DateContext = createContext({} as IContext);

const DateProvider = ({ children }: any) => {

  const [baseDate, _setBaseDate] = useState(startOfDay(new Date()))
  const [date, setDate] = useState(new Date());

  const setBaseDate = (newBaseDate: Date) => {
    const now = new Date();
    setDate(addSeconds(newBaseDate, differenceInSeconds(now, startOfDay(now))));
    _setBaseDate(newBaseDate);
  }

  const update = () => {
    const now = new Date();
    setDate(addSeconds(baseDate, differenceInSeconds(now, startOfDay(now))));
  };
  useInterval(() => {
    update();
  }, UPDATE_INTERVAL);

  return (
    <DateContext.Provider value={{ date, baseDate, setBaseDate }}>{children}</DateContext.Provider>
  );
};

export const useDate = () => {
  return useContext(DateContext);
};

export default DateProvider;
