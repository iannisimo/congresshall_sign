import axios, { AxiosError } from "axios";
import { ChangeEventHandler, ClipboardEventHandler, useEffect, useRef, useState } from "react";
import { PlusCircle, X } from "react-bootstrap-icons";

export const ImageSelectBox = ({ org, name, disabled = false, defaultValue = '', onChange, className }: { org?: string, name?: string, disabled?: boolean, defaultValue?: string, className?: string, onChange?: ChangeEventHandler<HTMLInputElement> }) => {

  const is_disabled = () => !org || disabled

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<string>(defaultValue);

  const [logos, setLogos] = useState<string[]>([]);

  const uploadFile = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const files = ev.target.files;
    if (!files) return;
    if (files.length <= 0) return;
    const file = files.item(0);
    if (!file) return;
    const fileReader: FileReader = new FileReader();
    fileReader.readAsDataURL(file)
    fileReader.onload = () => {
      if (!fileReader.result) throw '';
      const formData = new FormData();
      formData.append('file', file);
      axios.post(`/api/logo/${org}`, formData, {
        headers: {
          'Content-Type': "multipart/form-data"
        }
      }).then(() => updateLogos());
    }
  };

  const updateLogos = () => {
    if (!org) {
      setLogos([]);
      return;
    }
    axios.get(`/api/logo/byorg/${org}`).then((res) => {
      console.log(res.data);
      setLogos(res.data)
    }).catch((_) => { });
  }

  const deleteLogo = (logo_id: string) => {
    axios.delete(`/api/logo/${logo_id}`).then(() => {
      if (logo_id === selected) setSelected('');
      updateLogos();
    }).catch((err: AxiosError) => {
      if (err.status === 409) {
        const msg = err.response?.data ?? "";
        alert(msg);
      }
    });
  };

  const onSelect = (logo_id: string) => {
    const sel = logo_id === selected ? '' : logo_id
    setSelected(sel);
    if (!onChange) return;
    const ev = {
      target: {
        name: name,
        value: sel
      }
    } as React.ChangeEvent<HTMLInputElement>;
    onChange(ev);
  }

  useEffect(() => {
    setSelected(defaultValue);
  }, [defaultValue]);

  useEffect(() => {
    updateLogos();
  }, [org]);

  const handlePaste = (e: any) => {
    if (!e.clipboardData) return;
    if (e.clipboardData.files.length) {
      const fileObject = e.clipboardData.files[0];
      if (!fileObject) return;
      const fileReader: FileReader = new FileReader();
      fileReader.readAsDataURL(fileObject)
      fileReader.onload = () => {
        if (!fileReader.result) throw '';
        const formData = new FormData();
        formData.append('file', fileObject);
        axios.post(`/api/logo/${org}`, formData, {
          headers: {
            'Content-Type': "multipart/form-data"
          }
        }).then(() => updateLogos());
      }
      // const file = {
      //   getRawFile: () => fileObject,
      //   name: fileObject.name,
      //   size: fileObject.size,
      //   status: 2,
      //   progress: 0
      // };
      // console.log(file)
    } else {
      alert('No image data was found in your clipboard. Copy an image first or take a screenshot.');
    }
  };


  return (
    <>
      <div className={`${className} relative ${is_disabled() && "opacity-40"}`} onPaste={handlePaste} >
        <input onChange={uploadFile} disabled={is_disabled()} hidden type="file" accept="image/*" ref={fileInputRef} />
        <div className={`bg-white flex flex-row overflow-x-scroll w-full h-full p-5 space-x-5 `}>
          <div
            className={`h-full aspect-square rounded-lg border-2 p-10 border-gray-300 grid place-items-center ${!is_disabled() && "cursor-pointer"}`}
            onClick={() => fileInputRef.current?.click()}>
            <PlusCircle className="w-full h-full" />
          </div>
          {logos.map((logo_id) => (
            <div
              className={`relative h-full aspect-square rounded-lg border-2 ${selected === logo_id ? 'border-primary-900' : 'border-gray-300'} grid place-items-center`}
            >
              <img className={`h-full w-full ${!is_disabled() && "cursor-pointer"}`} src={`/api/logo/get/${logo_id}`} onClick={() => onSelect(logo_id)} />
              <X onClick={() => deleteLogo(logo_id)} className="absolute w-6 h-6 top-1 right-1 cursor-pointer bg-white border-2 rounded-full hover:border-red-600" />
            </div>
          ))}
        </div>
      </div>
    </>
  )
};
