// @ts-nocheck
import 'tailwindcss/tailwind.css';
import React, {useEffect, useRef, useState} from 'react'
import {CursorClickIcon, LocationMarkerIcon, QuestionMarkCircleIcon, SearchIcon, XIcon, ZoomInIcon } from "@heroicons/react/solid"
import {MapIcon} from "@heroicons/react/outline";

/**
 * Ssearch for token
 * @returns 
 */
function Help() {

    const [ helpActive, setHelpActive ] = useState<boolean>(false);
   

    return (
        <>

            <div onClick={() => setHelpActive(!helpActive)} className={`${helpActive && `scale-[0.90]`} transition hover:scale-[0.90] cursor-pointer flex flex-col text-center text-white space-y-1 justify-center items-center`}>
                <div className={`bg-torch-red rounded-full p-2`}>
                    <QuestionMarkCircleIcon className="w-4 h-4 text-white" />
                </div>
                <span className={"text-[11px] font-bold"}>Help</span>
            </div>


            {helpActive &&
                <div className="text-white/75 bg-haiti-400 rounded-xl p-8 z-[999] max-w-[550px] w-full fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                     <div className="absolute top-0 right-0 -m-2 bg-torch-red rounded-full flex w-8 cursor-pointer" onClick={() => setHelpActive(false)}>
                        <XIcon className="w-4 h-4 text-white fill-white m-2" />
                    </div>

                    <ul className="space-y-2">
                        <li className="space-x-6 flex items-center">
                            <span><ZoomInIcon className="w-8 h-8 text-white" /></span>
                             <span>
                                 Click and drag with your mouse in order to pan around the Cryptoverse map. Once you are happy with an area you can use your mouse wheel to zoom in and out of your desired section.
                             </span>
                        </li>
                        <li className="space-x-6 flex items-center">
                             <span><CursorClickIcon className="w-8 h-8 text-white" /></span>
                             <span>
                                 Click on your desired estate in order to select it for the minting process. You can select multiple parcels of the same type before minting.
                             </span>
                        </li>
                        <li className="space-x-6 flex items-center">
                            <span><LocationMarkerIcon className="w-8 h-8 text-white" /></span>
                             <span>For Single parcels you can click on the Estate in order to zoom into Single Parcel view</span>
                        </li>
                    </ul>

                </div>
            }


        </>
    )
}
export default Help;
