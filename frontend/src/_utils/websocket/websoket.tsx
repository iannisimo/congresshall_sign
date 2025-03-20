import axios from "axios";
import { useState, createContext, useContext, useEffect } from "react";
import useWebSocket from "react-use-websocket"
import { useDate } from "../date";
import { addDays, endOfDay, startOfDay } from "date-fns";
import { useInterval } from "../utils";
import { useAuth } from "../auth/authProvider";

export const enum RoomType {
  MAIN = "main",
  SUB = "sub"
};
export const enum RoomOccupancy {
  FREE = 0,
  OCCUPIED = 1,
  WARN = 2,
};

export type Room = {
  _id: string
  name: string
  type: RoomType
  sub_of: string
  sub_msg: string
  cur_status: RoomOccupancy
  custom_message: string
}

type RoomState = {
  cur_status: RoomOccupancy
  custom_message?: string
};

export type IEvent = {
  _id?: string
  logo?: string
  org?: string
  title?: string
  subtitle?: string
  room_ids?: string[]
  start_time?: Date
  end_time?: Date
  prep_time?: Date
  resolved?: boolean
};

interface IContext {
  main_rooms: () => Room[]
  sub_rooms: () => Room[]
  getRooms: (room_ids?: string[]) => Room[] | undefined
  getOrgs: () => Promise<string[]>
  events: IEvent[]
  deleteEvent: (event_id: string) => void;
  setRoom: (room_id: string, new_state: RoomState) => void
};

enum WSMessage {
  CHANGED_ROOMS = "0",
  CHANGED_EVENTS = "1"
};

export type TEventParams = {
  end_fun: (_date: Date) => Date;
  limit: Number;
};

const WSContext = createContext({} as IContext);

const WSProvider = ({ children }: any) => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [events, setEvents] = useState<IEvent[]>([]);
  const main_rooms = () => rooms.filter((room) => (room.type === RoomType.MAIN));
  const sub_rooms = () => rooms.filter((room) => (room.type === RoomType.SUB));

  const { date, baseDate } = useDate();
  const { token } = useAuth();

  useWebSocket('ws://127.0.0.1:5000/ws', {
    shouldReconnect: () => true,
    heartbeat: {
      message: "ping",
      returnMessage: "pong",
      interval: 10000,
    },
    onMessage: (event) => {
      switch (event.data ?? "") {
        case WSMessage.CHANGED_ROOMS:
          updateRooms();
          break;
        case WSMessage.CHANGED_EVENTS:
          updateEvents();
          break;
      }
    }
  });

  const getOrgs = async () => (
    new Promise<string[]>((resolve) => (
      axios.get('/api/orgs').then((res) => {
        resolve(res.data)
      }).catch((_) => { })
    ))
  )

  const getRooms = (room_ids?: string[]) => (rooms
    .filter((room) => (room_ids?.includes(room._id)))
    .sort((a, b) => ((room_ids?.indexOf(a._id) ?? -1) - (room_ids?.indexOf(b._id) ?? -1)))
  );

  const updateRooms = () => {
    axios.get('/api/rooms').then((res) => {
      setRooms(res.data);
    }).catch((_) => {
    })
  };

  const setRoom = (room_id: string, new_state: RoomState) => {
    axios.post(`/api/rooms/${room_id}`, new_state, {
      headers: {
        'Content-Type': 'application/json'
      }
    }).catch((_) => { });
  }

  const updateEvents = () => {
    const params = (!token) ? {
      end_time: endOfDay(addDays(date, 2)),
      limit: 12
    } : {
      start_time: startOfDay(date),
      end_time: endOfDay(date),
      limit: 0,
      get_resolved: true
    }

    axios.get('/api/events', { params: params }).then((res) => {
      const newEvents: IEvent[] = Object(res.data).map((event: any) => ({
        ...event,
        start_time: new Date(event.start_time),
        end_time: new Date(event.end_time),
        prep_time: new Date(event.prep_time)
      }))
      setEvents(newEvents);
    }).catch((_) => {
    })
  };

  const deleteEvent = (event_id: string) => {
    axios.delete(`/api/events/${event_id}`).catch((_) => { });
  }

  useInterval(updateRooms, 3600000);
  useInterval(updateEvents, 300000);
  useEffect(() => {
    updateRooms();
    updateEvents();
  }, [(token ? baseDate : undefined)]);

  return (
    <WSContext.Provider value={{ main_rooms, sub_rooms, getRooms, getOrgs, events, deleteEvent, setRoom }}>{children}</WSContext.Provider>
  );
};

export const useWS = () => {
  return useContext(WSContext);
};

export default WSProvider;
