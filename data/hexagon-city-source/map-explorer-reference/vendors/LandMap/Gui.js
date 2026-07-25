import {GUI} from 'three/examples/jsm/libs/lil-gui.module.min.js';

/**
 * Gui
 */
class Gui {
    constructor({ l2, activeL3, l3 }) {
        this.l2 = l2;
        this.l3 = l3;
        this.activeL3 = activeL3;
        this.createGUI();
    }

    /**
     * Toggle the Land Type
     * @param {Mesh} landType
     */
    toggleLandType = (landType) => {
        this.l2.map((child) => {
            child.children.map((parcels) => {
                if( parcels.type === landType) {
                    parcels.visible = !parcels.visible;
                }
            })
        })
    }


    /**
     * Show all Zones
     * In the scene
     */
    showAllZones = () => {
        this.l2.map((child) => {
            child.visible = true;
        })

        this.l3.map((l2Child) => {
            let mergedL3 = [...l2Child.children, ...this.activeL3.children];

            mergedL3.map((l3Child) => {
                l3Child.visible = true;
            })
        })
    }

    /**
     * Hide All Zones
     */
    hideAllZones = () => {
        this.l2.map((child) => {
            child.visible = false;
        })

        this.l3.map((l2Child) => {
            let mergedL3 = [...l2Child.children, ...this.activeL3.children];

            mergedL3.map((l3Child) => {
                l3Child.visible = false;
            })
        })
    }

    /**
     * Toggle the Zone visibility
     * @param {Mesh} zoneName
     */
    toggleZone = (zoneName) => {
        this.l2.map((child) => {
            if( child.name === zoneName) {
                child.visible = !child.visible;
            }
        })
    }


    /**
     * Create the Toggle Gui for the Experience
     */
    createGUI = () => {
        const panel = new GUI( { width: 125 } );
        const folderZones = panel.addFolder( 'Zones' );
        const folderTypes = panel.addFolder('Land Sizes');

        panel.domElement.id = 'gui';

        let settings = {
            'Hide All Zones' : true,
            'Show HUB' : true,
            'Show BUS' : true,
            'Show ENT' : true,
            'Show EDU' : true,
            'Show UW1' : true,
            'Show UW2' : true,
            'Show UW3' : true,
            'Show HS1' : true,
            'Show HS2' : true,
            'Show HS3' : true,

            'Show EPIC' : true,
            'Show GIANT' :  true,
            'Show LARGE' : true,
            'Show MEDIUM' : true,
            'Show SMALL' : true,
            'Show SINGLE' : true,
        };


        folderZones.add( settings, 'Show HUB' ).onChange( () => { this.toggleZone('HUB') });
        folderZones.add( settings, 'Show BUS' ).onChange( () => { this.toggleZone('BUS') });
        folderZones.add( settings, 'Show ENT' ).onChange( () => { this.toggleZone('ENT') });
        folderZones.add( settings, 'Show EDU' ).onChange( () => { this.toggleZone('EDU') });
        folderZones.add( settings, 'Show UW1' ).onChange( () => { this.toggleZone('UW1') });
        folderZones.add( settings, 'Show UW2' ).onChange( () => { this.toggleZone('UW2') });
        folderZones.add( settings, 'Show UW3' ).onChange( () => { this.toggleZone('UW3') });
        folderZones.add( settings, 'Show HS1' ).onChange( () => { this.toggleZone('HS1') });
        folderZones.add( settings, 'Show HS2' ).onChange( () => { this.toggleZone('HS2') });
        folderZones.add( settings, 'Show HS3' ).onChange( () => { this.toggleZone('HS3') });

        folderZones.add( settings, 'Hide All Zones' ).onChange( (e) => {
            if(e === false) {
                this.hideAllZones()

                folderZones.children.map((child) => {
                    child.$input.checked = false;
                })
            } else {
                this.showAllZones();
                folderZones.children.map((child) => {
                    child.$input.checked = true;
                })
            }

        });

        folderTypes.add( settings, 'Show EPIC' ).onChange( () => { this.toggleLandType('EPIC') });
        folderTypes.add( settings, 'Show GIANT' ).onChange( () => { this.toggleLandType('GIANT') });
        folderTypes.add( settings, 'Show LARGE' ).onChange( () => { this.toggleLandType('LARGE') });
        folderTypes.add( settings, 'Show MEDIUM' ).onChange( () => { this.toggleLandType('MEDIUM') });
        folderTypes.add( settings, 'Show SMALL' ).onChange( () => { this.toggleLandType('SMALL') });
        folderTypes.add( settings, 'Show SINGLE' ).onChange( () => { this.toggleLandType('SINGLE') });

        folderZones.close();
        folderTypes.close();
    }

}

export default Gui;