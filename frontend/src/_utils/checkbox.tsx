import { ChangeEventHandler, InputHTMLAttributes, useEffect, useRef } from "react"

interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  default_value?: boolean
  onChange?: ChangeEventHandler<HTMLInputElement>;
}

export const Checkbox: React.FC<CheckboxProps> = ({ default_value, onChange, ...props }) => {

  const cb_ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!cb_ref.current || default_value === undefined || !onChange) return;
    cb_ref.current.checked = default_value;
    const _ev = {
      target: {
        name: cb_ref.current.name,
        value: cb_ref.current.checked ? 'on' : 'off'
      }
    } as React.ChangeEvent<HTMLInputElement>;
    onChange(_ev);
  }, [cb_ref.current]);
  const handleChange = (() => {
    if (!cb_ref.current || !onChange) return;
    const _ev = {
      target: {
        name: cb_ref.current.name,
        value: cb_ref.current.checked ? 'on' : 'off'
      }
    } as React.ChangeEvent<HTMLInputElement>;
    onChange(_ev);
  })

  return (
    <>
      <input ref={cb_ref} type="checkbox" onChange={handleChange} {...props} />
    </>
  )
} 
