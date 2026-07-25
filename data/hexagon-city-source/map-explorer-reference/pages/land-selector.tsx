import 'tailwindcss/tailwind.css';
import React, {useEffect, useState} from 'react'

import Meta from "@partials/meta";
import LandLayout from "@layouts/LandLayout";
import dynamic from "next/dynamic";
import withAuth from "@providers/withAuth";
import {useGetGlobalClaimTokenBalance} from "@components/hooks/useGetGlobalClaimTokenBalance";
import {useWeb3React} from "@web3-react/core";
import UserActiveTokenList from "@ui/landSelector/UserActiveTokenList";
import WelcomeScreenWidget from "@ui/landSelector/WelcomeScreenWidget";
const WebGLComponent = dynamic(() => import('@ui/landSelector/WebGL'), { ssr: false })
import Link from 'next/link';
import {DesktopComputerIcon} from "@heroicons/react/outline";


/**
 * Land Selector Component
 * @constructor
 */
function LandSelector({ csrfToken, encrypted, timeStamp }) {
    const [ enterExperience, setEnterExperience ] = useState(false);
    const [ experienceOverride, setExperienceOverride ] = useState(false);
    const { GCTBalance, getBalance } = useGetGlobalClaimTokenBalance();

    return (
        <div>
            <Meta title="The Cryptoverse | Genesis" />
            <LandLayout>

                {/*
                    Disallow all users who are using the mobile app to access the landing page
                    This is to prevent users from accidentally clicking the link and entering the experience
                */}

                <div className={`[ md:hidden ] fixed top-0 left-0 z-[99999999999] w-full h-full bg-haiti-400/90 backdrop-blur-md flex flex-col space-y-4 items-center justify-center`}>
                    <DesktopComputerIcon className={`w-24 text-white/60`} />
                    <span className={`text-white/70 max-w-[550px] text-center`}>This experience is only available on a Desktop or Laptop,<br/>we currently don't support land selection on mobile devices</span>
                </div>

                <div className="flex items-center space-x-4 fixed top-0 left-0 z-[500] m-6 mt-11">
                    <Link href={`/`}>
                        <img className="w-full pointer-events-auto max-w-[30px] [ lg:max-w-[30px] ] brand" src="/brand@2x.png" alt="Cryptoverse" title="Cryptoverse" />
                    </Link>
                </div>

                <div className={`fixed top-0 left-0 w-full h-full justify-center items-center bg-haiti-600`}>

                    {!enterExperience && GCTBalance &&
                        <>
                            <WelcomeScreenWidget balance={GCTBalance} onCallback={() => setEnterExperience(true)} />
                        </>
                    }

                     {!enterExperience &&
                        <img
                            src="/ui-map-grayscale@2x.jpg"
                            className={`fixed top-0 left-0 w-full h-full z-[-1] object-cover opacity-[0.2] grayscale`} alt=""
                        />
                    }

                    {(enterExperience && GCTBalance && GCTBalance.hasBalance) || experienceOverride ?
                        <div className={`hidden [ md:block ] aspect-video self-center items-center justify-center py-24`}>
                            <WebGLComponent callback={async () => {
                                setExperienceOverride(true);
                                await getBalance()
                            }
                            } balances={GCTBalance.balances} />
                        </div>
                    : null}

                </div>

                {GCTBalance && GCTBalance.balances.length &&
                    <div className={`fixed top-0 right-0 z-[200] flex items-center m-12 mr-10 space-x-4`}>
                        <span className={`text-white text-xs font-bold`}>My Balance:</span>
                        <UserActiveTokenList balance={GCTBalance.balances} />
                    </div>
                }
            </LandLayout>
        </div>
    )
}

export default withAuth(LandSelector)
