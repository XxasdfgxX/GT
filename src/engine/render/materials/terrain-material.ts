/** Island ground: sand, paved lots, rock and grass blended by per-vertex weights. */

import { MeshStandardMaterial, type Texture } from 'three';
import { glslFloat } from './uv-meters';

export interface TerrainLayer {
  color: Texture;
  normal: Texture;
  /** Meters one repeat covers. */
  tile: number;
}

/** Layer order matches the `splat` attribute: sand, paved, rock, grass. */
export function createTerrainMaterial(
  layers: readonly [TerrainLayer, TerrainLayer, TerrainLayer, TerrainLayer],
): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  const [sand, paved, rock, grass] = layers;
  const scale = layers.map((layer) => glslFloat(1 / layer.tile));
  material.customProgramCacheKey = () => 'terrain-splat';
  material.onBeforeCompile = (shader) => {
    shader.uniforms['tColor0'] = { value: sand.color };
    shader.uniforms['tColor1'] = { value: paved.color };
    shader.uniforms['tColor2'] = { value: rock.color };
    shader.uniforms['tColor3'] = { value: grass.color };
    shader.uniforms['tNormal0'] = { value: sand.normal };
    shader.uniforms['tNormal1'] = { value: paved.normal };
    shader.uniforms['tNormal2'] = { value: rock.normal };
    shader.uniforms['tNormal3'] = { value: grass.normal };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec4 splat;
        varying vec4 vSplat;
        varying vec3 vGroundPos;
        varying vec3 vGroundNormal;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vSplat = splat;
        vGroundPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vGroundNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D tColor0, tColor1, tColor2, tColor3;
        uniform sampler2D tNormal0, tNormal1, tNormal2, tNormal3;
        varying vec4 vSplat;
        varying vec3 vGroundPos;
        varying vec3 vGroundNormal;`,
      )
      .replace(
        '#include <map_fragment>',
        `vec4 groundW = vSplat;
        // Slopes the paving does not cover turn to rock.
        float steep = smoothstep(0.82, 0.62, vGroundNormal.y) * (1.0 - groundW.y);
        groundW = mix(groundW, vec4(0.0, 0.0, 1.0, 0.0), steep);
        groundW /= max(dot(groundW, vec4(1.0)), 1e-4);
        vec2 groundP = vGroundPos.xz;
        vec2 uv0 = groundP * ${scale[0]};
        vec2 uv1 = groundP * ${scale[1]};
        vec2 uv2 = groundP * ${scale[2]};
        vec2 uv3 = groundP * ${scale[3]};
        vec3 groundAlbedo =
          texture2D(tColor0, uv0).rgb * groundW.x +
          texture2D(tColor1, uv1).rgb * groundW.y +
          texture2D(tColor2, uv2).rgb * groundW.z +
          texture2D(tColor3, uv3).rgb * groundW.w;
        // A slow swell in brightness, so the repeat does not read as a grid from the air.
        float swell = texture2D(tColor2, groundP * 0.0071).r;
        groundAlbedo *= 0.75 + 0.6 * swell;
        diffuseColor.rgb *= groundAlbedo;`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `vec3 groundTn =
          (texture2D(tNormal0, uv0).xyz * groundW.x +
          texture2D(tNormal1, uv1).xyz * groundW.y +
          texture2D(tNormal2, uv2).xyz * groundW.z +
          texture2D(tNormal3, uv3).xyz * groundW.w) * 2.0 - 1.0;
        // Planar from above: u runs along +X and v along +Z.
        vec3 groundN = normalize(vGroundNormal + vec3(groundTn.x, 0.0, groundTn.y) * 0.8);
        normal = normalize((viewMatrix * vec4(groundN, 0.0)).xyz);`,
      );
  };
  return material;
}
