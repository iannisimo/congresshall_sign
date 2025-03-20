import Plus from "../../assets/plus.svg?react"

const Footer = () => {

    return (
        <>
            <div className="mt-auto w-full h-32 relative flex flex-row justify-evenly box-border fill-primary-900">
                <Plus className="h-full w-fit !stroke-primary-900 hover:!stroke-primary-700 cursor-pointer" />
            </div>
        </>
    );
};

export default Footer;