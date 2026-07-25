import 'tailwindcss/tailwind.css';
import React, {useEffect, useState} from 'react'
import {MapIcon} from "@heroicons/react/outline";
import {XIcon} from "@heroicons/react/solid";


/**
 * Map Visibility
 * @param reset
 * @constructor
 */
function MapVisiblity() {
    const [ mapVisibility, setMapVisiblity ] = useState(false);
    return (
        <>

            <div onClick={() => setMapVisiblity(true)} className={`hover:scale-[0.85] rounded-2xl fixed bottom-0 right-[10px] max-w-[125px] w-full m-4 mr-10 border-2 border-solid overflow-hidden border-torch-red`}>
                <img className={`w-full object-contain`} src="/cryptoverse-map@2x.jpg" loading={'lazy'} alt=""/>
            </div>

            {mapVisibility &&
                <div className={`w-screen top-0 left-0 bg-black/40 h-screen fixed flex items-center justify-center z-[999999]`}>
                    <div className={`w-[100%] h-[100%] relative flex items-center justify-center py-32`}>
                        <div className={`relative max-w-[1200px] h-full`}>
                            <div className="absolute top-0 -m-2 right-0 bg-torch-red rounded-full flex w-8 cursor-pointer z-[99999]" onClick={() => setMapVisiblity(false)}>
                                <XIcon className="w-4 h-4 text-white fill-white m-2" />
                            </div>
                            <a href={`https://cg.mypinata.cloud/ipfs/Qmbipuwu75T9HzRRN2hoAA4i92koygkxBQ7ZT664EsgQp9`} target={`_blank`}>
                                <img className={`w-full h-full object-contain`} src="https://cg.mypinata.cloud/ipfs/Qmbipuwu75T9HzRRN2hoAA4i92koygkxBQ7ZT664EsgQp9" loading={'lazy'} alt=""/>
                            </a>
                        </div>
                    </div>
                </div>
            }
        </>

    )
}
export default MapVisiblity;
