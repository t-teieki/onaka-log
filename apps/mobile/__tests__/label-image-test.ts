// 撮影した画像の下ごしらえ（F-012-16、ADR-0004・ADR-0010）: 長辺 1024px の JPEG にし、端末の一時ファイルは消す
import { prepareImage } from '@/features/label/prepare-image';

const mockResize = jest.fn();
const mockSave = jest.fn();
const mockDeleted: string[] = [];
let mockFailSave = false;

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
  ImageManipulator: {
    manipulate: (uri: string) => {
      const context = {
        uri,
        resize: (size: { width?: number; height?: number }) => {
          mockResize(size);
          return context;
        },
        renderAsync: async () => ({
          saveAsync: async (options: unknown) => {
            mockSave(options);
            if (mockFailSave) throw new Error('save failed');
            return { uri: 'file:///cache/manipulated.jpg', width: 1024, height: 768, base64: 'QkFTRTY0' };
          },
        }),
      };
      return context;
    },
  },
}));

jest.mock('expo-file-system', () => ({
  File: class {
    mockUri: string;
    constructor(mockUri: string) {
      this.mockUri = mockUri;
    }
    delete() {
      mockDeleted.push(this.mockUri);
    }
  },
}));

const PHOTO = 'file:///cache/camera/photo.jpg';

afterEach(() => {
  mockResize.mockClear();
  mockSave.mockClear();
  mockDeleted.splice(0);
  mockFailSave = false;
});

describe('撮影した画像の下ごしらえ（F-012-16）', () => {
  it('[F-012-16] 横長なら幅を 1024px にし、JPEG（品質 0.8）の base64 にする', async () => {
    const image = await prepareImage({ uri: PHOTO, width: 4032, height: 3024 });
    expect(mockResize).toHaveBeenCalledWith({ width: 1024 });
    expect(mockSave).toHaveBeenCalledWith({ format: 'jpeg', compress: 0.8, base64: true });
    expect(image).toEqual({ media_type: 'image/jpeg', data_base64: 'QkFTRTY0' });
  });

  it('[F-012-16] 縦長なら高さを 1024px にする', async () => {
    await prepareImage({ uri: PHOTO, width: 3024, height: 4032 });
    expect(mockResize).toHaveBeenCalledWith({ height: 1024 });
  });

  it('[F-012-16] 長辺が 1024px 以下なら大きくしない', async () => {
    await prepareImage({ uri: PHOTO, width: 800, height: 600 });
    expect(mockResize).not.toHaveBeenCalled();
  });

  it('[F-012-16] 撮影と縮小でできた一時ファイルを消す（ADR-0004）', async () => {
    await prepareImage({ uri: PHOTO, width: 4032, height: 3024 });
    expect(mockDeleted.sort()).toEqual(['file:///cache/camera/photo.jpg', 'file:///cache/manipulated.jpg']);
  });

  it('[F-012-16] 縮小に失敗しても撮影の一時ファイルは消す', async () => {
    mockFailSave = true;
    await expect(prepareImage({ uri: PHOTO, width: 4032, height: 3024 })).rejects.toThrow();
    expect(mockDeleted).toEqual([PHOTO]);
  });
});
