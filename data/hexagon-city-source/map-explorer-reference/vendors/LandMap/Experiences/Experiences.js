import * as THREE from "three";

/**
 * Experiences
 */
class Experiences {
    constructor({ scene, l2Map }) {
        this.experiences = [];
        this.scene = scene;
        this.l2 = l2Map;
        this.addExperiences();
        this.animate();
    }

    /**
     * Rotate Experience
     * @param object
     */
    rotateExperience(object) {
        if(object) {
            object.rotation.y += 0.05;
        }
    }

    /**
     * Find Active Experiences
     *
     */
    findActiveExperiences() {
        if(this.scene === null) return;
        this.experiences.map((experience) => {
            let object = this.scene.getObjectByName(Number(experience.land_id));

            if(object) {
                this.createNewExperience(object, experience);
            }
        })
    }

    /**
     * Find Active Experiences & Rotate
     */
    findExperiencesAndRotate() {
        this.experiences.map((experience) => {
            let object = this.scene.getObjectByName(`cube-experience-${experience.land_id}`);

            if(object) {
                this.rotateExperience(object);
            }
        })
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.findExperiencesAndRotate();
    }

    /**
     * Create New Experience
     * @param mesh
     * @param experience
     */
    createNewExperience(mesh, experience)  {
        if(this.scene === null) return;

        mesh.geometry.computeBoundingBox();
        let center = new THREE.Vector3();
        mesh.geometry.boundingBox.getCenter(center);
        mesh.geometry.center();

        const newPos = mesh.position.copy(center);

        let target = new THREE.Vector3();

        mesh.getWorldPosition( target );

        let bb = new THREE.Box3().setFromObject(mesh);
        let size = bb.getSize(new THREE.Vector3());

        const texture = new THREE.TextureLoader().load(experience.logo_image);
        const geometry = new THREE.BoxBufferGeometry( size.x/1.2, size.z/2, 2 );
        const material = new THREE.MeshBasicMaterial( { map: texture } );
        const cube = new THREE.Mesh( geometry, material );

        cube.rotateX(-1.25)
        cube.name = `cube-experience-${experience.land_id}`;
        cube.position.set(target.x, 4, target.z)
        this.scene.add( cube );
    }

    /**
     * Add Experiences
     */
    addExperiences() {
        (async() => {
            const experiences = await this.getListOfExperiencesAsync();
            this.experiences.push(...experiences);
            this.findActiveExperiences();
        })()
    }

    /**
     * Get List of Async Experiences
     * @returns {Promise<*|undefined>}
     */
     getListOfExperiencesAsync() {
         return (async() => {
             const response = await fetch(`${process.env.NEXT_PUBLIC_API}/experiences?item_per_page=100`);
             try {
                 const json = await response.json();

                 if(json.result && json.result.items) {
                     return json.result.items;
                 }
             } catch (error) {
                 console.log(error);
             }
         })()
    }
}

export default Experiences;