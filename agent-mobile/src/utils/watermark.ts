import RNPhotoManipulator from 'react-native-photo-manipulator';
import { Image } from 'react-native';

interface WatermarkData {
  agentName: string;
  meterNo: string;
  bpNo: string;
}

export const createWatermarkedPhoto = async (
  imageUri: string,
  data: WatermarkData
): Promise<string> => {
  try {
    const { width, height } = await new Promise<{ width: number; height: number }>(
      (resolve) => {
        Image.getSize(
          imageUri,
          (w, h) => resolve({ width: w, height: h }),
          () => resolve({ width: 1080, height: 1440 })
        );
      }
    );

    const fontSize = Math.round(width * 0.038);
    const padX = Math.round(width * 0.025);
    const padY = Math.round(height * 0.02);

    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    const result = await RNPhotoManipulator.printText(
      imageUri,
      [
        // Top left — agent name
        {
          position: { x: padX, y: padY },
          text: data.agentName,
          textSize: fontSize,
          color: '#FFFF00',
          thickness: 2,
        },
        // Top right — date time
        {
          position: { x: Math.round(width * 0.5), y: padY },
          text: dateStr,
          textSize: fontSize,
          color: '#FFFF00',
          thickness: 2,
        },
        // Bottom left — meter number
        {
          position: { x: padX, y: height - padY - fontSize * 2 },
          text: `Meter: ${data.meterNo}`,
          textSize: fontSize,
          color: '#FFFF00',
          thickness: 2,
        },
        // Bottom right — BP number
        {
          position: { x: Math.round(width * 0.5), y: height - padY - fontSize * 2 },
          text: `BP: ${data.bpNo}`,
          textSize: fontSize,
          color: '#FFFF00',
          thickness: 2,
        },
      ],
      'jpeg',
      0.95
    );

    return result;
  } catch (err) {
    console.warn('Watermark failed, using original photo:', err);
    return imageUri;
  }
};
