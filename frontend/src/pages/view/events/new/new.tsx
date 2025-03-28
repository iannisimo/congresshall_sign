import { ReactNode, useEffect, useRef, useState } from "react";
import Event from "../event";

import AsyncCreatable from "react-select/async-creatable";
import Select, { ActionMeta, MultiValue, SingleValue } from "react-select";

import { debounce, GoogleSearch } from "../../../../_utils/utils";

import { IEvent, useWS } from "../../../../_utils/websocket/websoket";
import axios from "axios";
import { addDays, differenceInMilliseconds, format } from "date-fns";
import { ImageSelectBox } from "./imgSelection";
import { Checkbox } from "../../../../_utils/checkbox";
import { EyeFill, EyeSlashFill, Search } from 'react-bootstrap-icons'

type OrgOption = {
  label: string | undefined
  value: string | undefined
}

type RoomOption = {
  label: string
  value: string
}

const NewEvent = ({ close, _event }: { close?: Function, _event?: IEvent }): ReactNode => {

  useEffect(() => {
    if (_event) {
      setEvent(_event);
      setEventDate(format(_event.start_time ?? new Date(), "yyyy-MM-dd"));
      setPrepDate(format(_event.prep_time ?? new Date(), "yyyy-MM-dd"));
    }
  }, [])

  const popupRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewStyle, setPreviewStyle] = useState({});
  const [search, setSearch] = useState<string | undefined>(undefined);

  const [eventDate, setEventDate] = useState<string>("");
  const [prepDate, setPrepDate] = useState<string>("");
  const [event, setEvent] = useState<IEvent>({});

  const { main_rooms, getOrgs, getRooms } = useWS();
  const roomOptions: RoomOption[] = main_rooms().map((room) => ({
    label: room.name,
    value: room._id
  }))

  const orgOptions = async (searchValue: string) => {
    const orgs = await getOrgs();
    const f_orgs: OrgOption[] = orgs.filter((org) => org.toLowerCase()
      .startsWith(searchValue.toLowerCase()))
      .map((org) => ({ label: org, value: org }))
    return f_orgs;
  };

  useEffect(() => {
    console.log(event);
  }, [event]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement> | { target: { name: string, value: string } }) => {
    const { name, value } = e.target;
    switch (name) {
      case "eventDate":
        setEventDate(value);
        setPrepDate(value);
        setEvent((prevEvent: IEvent) => ({
          ...prevEvent,
          "start_time": undefined,
          "end_time": undefined,
          "prep_time": undefined
        }));
        break;
      case "prepDate":
        setPrepDate(value);
        setEvent((prevEvent: IEvent) => ({
          ...prevEvent,
          "prep_time": undefined
        }));
        break;
      case "prep_time":
        const valuePrep = new Date(`${prepDate}T${value}`);
        if ((valuePrep) >= (event.start_time ?? new Date())) {
          break;
        }
        setEvent((prevEvent: IEvent) => ({
          ...prevEvent,
          [name]: valuePrep
        }));
        break;
      case "start_time":
      case "end_time":
        const valueEvent = new Date(`${eventDate}T${value}`);
        if ((valueEvent) < (event.start_time ?? new Date())) {
          break;
        }
        setEvent((prevEvent: IEvent) => ({
          ...prevEvent,
          [name]: valueEvent
        }));
        break;
      case "enabled":
        setEvent((prevEvent: IEvent) => ({
          ...prevEvent,
          [name]: value === 'on'
        }))
        break;
      default:
        if (value) {
          setEvent((prevEvent: IEvent) => ({
            ...prevEvent,
            [name]: value,
          }));
        } else {
          setEvent((prevEvent: IEvent) => ({
            ...prevEvent,
            [name]: undefined,
          }));
        }
    }
  };

  const handleOrgChange = (option: SingleValue<OrgOption> | null, action: ActionMeta<OrgOption>) => {
    const ev = { target: { name: action.name ?? "", value: option?.value } } as React.ChangeEvent<HTMLInputElement>;
    handleChange(ev);
    // console.log(option, a);
    // setEvent((prevEvent: IEvent) => ({
    //   ...prevEvent,
    //   org: option?.value
    // }));
  }

  const handleRoomsChange = (option: MultiValue<RoomOption>, _: any) => {
    const rooms = option.map(({ value }) => (value));
    setEvent((prevEvent: IEvent) => ({
      ...prevEvent,
      room_ids: rooms
    }))
  }

  const uploadEvent = (newEvent: IEvent) => {
    if (newEvent.resolved && newEvent.end_time && differenceInMilliseconds(newEvent.end_time, new Date()) > 0) newEvent.resolved = false;
    const endpoint = newEvent._id ? `/api/events/${event._id}` : '/api/events'
    axios.post(endpoint, newEvent, {
      headers: {
        'Content-Type': 'application/json'
      }
    }).then((res) => { console.log(res) });
    if (close) close();
  }

  useEffect(() => {
    if (!previewRef.current) return;
    const originalHeight = previewRef.current.offsetHeight;
    const onresize = debounce((_: any) => {
      if (!popupRef.current) return;
      let rect = popupRef.current.getBoundingClientRect();
      const scale_factor = rect.width / 1920;
      setPreviewStyle({ transform: `scale(${scale_factor})`, height: `${originalHeight * scale_factor}px` })
    }, 50);
    window.addEventListener('resize', onresize);
    onresize(null);

    return () => {
      window.removeEventListener('resize', onresize);
    };
  }, []);

  useEffect(() => {
    if (!eventDate) {
      event.start_time = undefined;
      event.end_time = undefined;
    }
    if (!prepDate) {
      event.prep_time = undefined;
    }
  }, [eventDate, prepDate]);

  const onCalKeyDown = (setter: React.Dispatch<React.SetStateAction<string>>) => (ev: React.KeyboardEvent<HTMLInputElement>) => {
    const key = ev.key;
    switch (key) {
      case 'o':
        setter(format(new Date(), "yyyy-MM-dd"));
        break;
      case 'd':
        setter(format(addDays(new Date(), 1), "yyyy-MM-dd"));
        break;
    }
  };

  return (
    <>
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-opacity-75 bg-black backdrop-blur-md">
        <div ref={popupRef} className="w-screen h-fit bg-black rounded-lg">
          <div ref={previewRef} className="w-[1920px] h-fit px-5 py-2 origin-top-left duration-100" style={previewStyle}>
            <Event event={event}></Event>
            <Event event={event} collapsed={true} />
          </div>
        </div>
        <div className="w-[70vw] h-fit bg-gradient-to-br from-primary-900 to-primary-500 rounded-xl flex flex-col mt-5 shadow-primary-300 shadow-lg">
          <div className="w-full h-full">
            <form className="" action={() => uploadEvent(event)}>
              <div className="w-full h-full relative flex flex-col justify-between items-start px-5">
                <label className="mt-2">Organizzatori</label>
                <AsyncCreatable
                  defaultValue={{ value: _event?.org, label: _event?.org }}
                  defaultOptions={true}
                  loadOptions={orgOptions}
                  className="w-full"
                  placeholder="Seleziona..."
                  isClearable={true}
                  allowCreateWhileLoading={true}
                  name="org"
                  onChange={handleOrgChange}
                  required={true} />
                <div className="flex flex-row w-full justify-between">
                  <label className="mt-2">Logo:</label>
                  <div className={`flex flex-row space-x-4 ${event.org && "group"}`}>
                    <input className="ease-in-out duration-200 scale-x-0 w-0 group-hover:w-fit group-hover:scale-x-100 origin-right overflow-scroll" defaultValue={event.org ?? ""} onChange={(ev) => setSearch(ev.target.value)} />
                    <a className={`${!event.org && "pointer-events-none"}`} title="Cerca Logo" href={GoogleSearch(search ?? event.org ?? '')} target="_blank" rel="noopener noreferrer">
                      <Search className="py-2 h-full aspect-square cursor-pointer" />
                    </a>
                    {/* <Search className="py-2 h-full aspect-square cursor-pointer" /> */}
                  </div>
                </div>
                <ImageSelectBox org={event.org} onChange={handleChange} defaultValue={event?.logo ?? ""} name="logo" className="w-full h-40 rounded-lg relative" />
                <label className="mt-2">Sale</label>
                <Select
                  defaultValue={(getRooms(_event?.room_ids) ?? []).map(({ _id, name }) => ({ value: _id, label: name }))}
                  className="w-full"
                  placeholder="Seleziona..."
                  name="rooms"
                  options={roomOptions}
                  isMulti={true}
                  onChange={handleRoomsChange}
                  required={true} />
                <label className="mt-2">Titolo</label>
                <input disabled={!event.org} type="text" name="title" value={event.title ?? ""} onChange={handleChange} required={true} placeholder="...." className="w-full h-fit text-lg px-2 rounded-sm" />
                <label className="mt-2">Sottotitolo</label>
                <input disabled={!event.org} type="text" name="subtitle" value={event.subtitle ?? ""} onChange={handleChange} required={false} placeholder="...." className="w-full h-fit text-lg px-2 rounded-sm" />
                <div className="w-full h-fit mt-4 flex flex-row justify-around">
                  <div className="w-full flex flex-col space-y-2 items-center ">
                    <label className="w-fit">Data evento: </label>
                    <input onKeyDown={onCalKeyDown(setEventDate)} disabled={!event.org} className="w-fit font-mono border-0 select-none" required={true} type="date" name="eventDate" value={eventDate} onChange={handleChange} ></input>
                  </div>
                  <div className="w-full flex flex-col space-y-2 items-center justify-start">
                    <label className="w-fit">Inizio evento: </label>
                    <input disabled={!eventDate} className="w-fit font-mono border-0 select-none" required={true} type='time' step={60} name="start_time" onChange={handleChange} value={event.start_time?.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) ?? ''}></input>
                  </div>
                  <div className="w-full flex flex-col space-y-2 items-center ">
                    <label className="w-fit">Fine evento: </label>
                    <input disabled={!eventDate} className="w-fit font-mono border-0 select-none" required={true} type='time' step={60} name="end_time" onChange={handleChange} value={event.end_time?.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) ?? ''}></input>
                  </div>
                </div>
                <div className="w-full h-fit mt-4 flex flex-row justify-around">
                  <div className="w-full flex flex-col items-center justify-center">
                    <label className="w-fit">Visibile:</label>
                    <label className="relative cursor-pointer w-6 h-6">
                      <Checkbox className="w-full h-full peer appearance-none" name="enabled" default_value={event.enabled === false ? false : true} onChange={handleChange} />
                      <EyeFill className="w-full h-full absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 opacity-0 peer-checked:opacity-100 " />
                      <EyeSlashFill className="w-full h-full absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 opacity-100 peer-checked:opacity-0 " />
                    </label>
                  </div>
                  <div className="w-full flex flex-col space-y-2 items-center ">
                    <label className="w-fit">Data preparazione: </label>
                    <input onKeyDown={onCalKeyDown(setPrepDate)} disabled={!event.start_time} className="w-fit font-mono border-0 select-none" required={true} type="date" name="prepDate" value={prepDate} onChange={handleChange} ></input>
                  </div>
                  <div className="w-full flex flex-col space-y-2 items-center justify-start">
                    <label className="w-fit">Orario preparazione: </label>
                    <input disabled={!eventDate} className="w-fit font-mono border-0 select-none" required={true} type='time' step={60} name="prep_time" onChange={handleChange} value={event.prep_time?.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) ?? ''}></input>
                  </div>
                </div>

                <div className="flex flex-row justify-end items-end w-full h-fit">
                  <button className="w-fit h-10 px-10 m-4 rounded-lg bg-gray-300 hover:bg-gray-200 " type="button" onClick={() => { if (close) close() }}>Cancella</button>
                  <button className="w-fit h-10 px-10 m-4 rounded-lg bg-gray-300 hover:bg-gray-200 " type="submit">Salva</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  )
};

export default NewEvent;
