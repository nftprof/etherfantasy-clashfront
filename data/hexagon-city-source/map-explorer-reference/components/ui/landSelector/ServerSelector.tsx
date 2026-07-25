import 'tailwindcss/tailwind.css';
import React, {useEffect, useState} from 'react'
import {toast} from "react-toastify";
import useSWR from "swr";
import {TOAST_MESSAGE_DEFAULTS} from "@settings/constants";

/**
 * Server Selector
 * @param onCallback
 * @constructor
 */
export default function ServerSelector({onCallback}) {
    const [ instanceList, toggleInstanceList ] = useState(null);
    const { data: serverList } = useSWR(`https://api.dasha.chainguardians.io/cryptoverse/pixel_streaming_urls`)

    /**
     * Set Faux Delay
     * @param delay
     */
    function delay(delay) {
        return new Promise(resolve => {
            setTimeout(() => {
                resolve(2);
            }, delay);
        });
    }

    /**
     * Connect to the nearest available server
     * @constructor
     */
    const ConnectToAvailableServer = async () => {
        if(!serverList) return;

        let findAvailableServer = null;

        serverList.map((server) => {
            if(findAvailableServer) return;
            server.instances.find((instance) => {
               instance.name = server.name;
               findAvailableServer = instance.isAvailable ? instance : null;
            })
       });


        if(findAvailableServer) {
            toast.success(`Connecting to ${findAvailableServer.name}`, TOAST_MESSAGE_DEFAULTS);
            toast.clearWaitingQueue();

            await delay(2000);

            onCallback(findAvailableServer)
            return;
        }

        toast.error(`Couldn't find available server, will continue to poll for new servers`, TOAST_MESSAGE_DEFAULTS);
        toast.clearWaitingQueue();
        return;
    }

    useEffect(() => {
        (async() => {
         //  await ConnectToAvailableServer();
        })()
    }, [ serverList ])

    return (
        <>
            <div className={`text-white justify-center items-center fixed w-full top-1/2 -translate-y-1/2 flex flex-col`}>
                <div className={`space-y-4 pb-8 text-center max-w-[450px]`}>
                    <h2 className={`text-sm`}>Select a server</h2>
                    <p>Please select an appropriate server from the list below, alternatively click here for us to try and select one for you.</p>

                    <span className={`bg-haiti-400/20 rounded-lg p-2 px-4 table mx-auto`}>
                        Current Servers: {serverList?.length}
                    </span>
                </div>

                <div className={`bg-haiti-400 w-full max-w-[750px] rounded-lg justify-center items-center max-h-[600px] overflow-scroll disable-scrollbars`}>
                    <div className={`grid grid-cols-2 bg-haiti-500 p-2 px-4 rounded-t-lg`}>
                        <div>Server Name</div>
                        <div className={`text-right`}>Max Users</div>
                    </div>

                    {serverList && serverList.map((server, key) => {
                        return (
                            <div onClick={() => toggleInstanceList(instanceList === key ? null : key)} key={key} className={`cursor-pointer bg-haiti-400 p-2 px-4 border-b border-solid border-white/10`}>
                                <div className={`grid grid-cols-2 `}>
                                    <div className={`flex items-center space-x-2`}>
                                        <span className={`w-[8px] h-[8px] ${!server.available ? 'bg-red-400' : 'bg-green-400'} rounded-full`} />
                                        <span>{server.name}</span>
                                    </div>
                                    <div className={`text-right`}>{server.total-server.available}/{server.total}</div>
                                </div>

                                <div className={`mt-2 ml-4`}>
                                    {server.instances.map((instance, instanceKey) => {
                                        return (
                                            <div
                                                onClick={() => {
                                                    if(instance.isAvailable) {
                                                        instance.name = server.name;
                                                        onCallback(instance)
                                                        return
                                                    }

                                                    toast.error(`Can't connect to a server that is unavailable`);
                                                    toast.clearWaitingQueue()
                                                    return
                                                }}
                                                key={instanceKey} className={`grid grid-cols-2 space-y-2 ${instanceList !== key && `hidden`}`}>
                                                <div className={`flex items-center space-x-2`}>
                                                    <span className={`w-[8px] h-[8px] ${!instance.isAvailable ? 'bg-red-400' : 'bg-green-400'} rounded-full`} />
                                                    <span>Instance {instanceKey+1}</span>
                                                </div>
                                                <div className={`text-right`}>
                                                    {instance.isAvailable ? <div className={`button button-small p-[1px] px-4 ml-auto`}>Join</div> : 'Not Available'}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>

                            </div>
                        )
                    })}
                </div>

            </div>
        </>
    )
}
