import axios, { AxiosError } from "axios";
import { ChangeEventHandler, useEffect, useRef, useState } from "react";
import { PlusCircle, X } from "react-bootstrap-icons";

export const ImageSelectBox = ({ org, name, disabled = false, defaultValue = '', onChange, className }: { org?: string, name?: string, disabled?: boolean, defaultValue?: string, className?: string, onChange?: ChangeEventHandler<HTMLInputElement> }) => {

  const is_disabled = () => !org || disabled

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<string>(defaultValue);

  const [logos, setLogos] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState<boolean>(false);

  const uploadFile = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const files = ev.target.files;
    if (!files) return;
    if (files.length <= 0) return;
    const file = files.item(0);
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
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

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    setDragOver(false);
    event.preventDefault();
    if (!event.dataTransfer) return;
    const url = event.dataTransfer.getData("URL");
    if (url) {
      const r = await fetch(`https://corsproxy.io/?url=${url}`);
      const b = await r.blob();
      if (b.type.startsWith('image/')) {
        const f = new File([b], 'image', { type: b.type });
        const d = new DataTransfer();
        d.items.add(f);
        const _ev = { target: { files: d.files } } as React.ChangeEvent<HTMLInputElement>;
        uploadFile(_ev);
        return;
      }
    }
    if (event.dataTransfer.files.length > 0) {
      const _ev = { target: { files: event.dataTransfer.files } } as React.ChangeEvent<HTMLInputElement>;
      uploadFile(_ev);
      return;
    }
  };

  return (
    <>
      <div className={`${className} relative ${is_disabled() && "opacity-40"}`}
        onDrop={handleDrop}
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDragEnter={() => { setDragOver(true) }}
        onDragExit={() => { setDragOver(false) }}
      >
        {dragOver && (
          <div className="h-full w-full flex flex-row justify-center items-center absolute bg-clip-content p-3 z-10 bg-gray-300 opacity-80 border-2">
            <label className="text-lg">Rilascia qua l'immagine</label>
          </div>
        )}
        <input ref={fileInputRef} hidden onChange={uploadFile} disabled={is_disabled()} />
        <div className={`bg-white flex flex-row overflow-x-scroll w-full h-full p-5 space-x-5`}>
          <div
            className={`h-full aspect-square rounded-lg border-2 p-10 border-gray-300 grid place-items-center ${!is_disabled() && "cursor-pointer"}`}
            onClick={() => { if (fileInputRef.current) fileInputRef.current.click(); }}
          >
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
      </div >
    </>
  )
};
