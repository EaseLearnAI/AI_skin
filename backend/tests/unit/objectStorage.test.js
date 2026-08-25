const { createObjectStorageProvider } = require('../../src/providers/storage/objectStorage');

describe('object storage privacy boundaries', () => {
  const file = { path: '/tmp/test-image.jpg', originalname: 'face.jpg' };

  test('always stores face images privately and returns a short-lived signed URL', async () => {
    const client = {
      put: jest.fn(async (key) => ({ name: key })),
      signatureUrl: jest.fn((key) => `https://signed.example/${key}`),
      delete: jest.fn()
    };
    const fsPromises = { readFile: jest.fn(async () => Buffer.from('image')), unlink: jest.fn() };
    const provider = createObjectStorageProvider({
      client,
      productImagesPublic: true,
      fsPromises,
      now: () => 1234
    });

    const result = await provider.uploadFaceImage(file);

    expect(result.key).toMatch(/^faces\/1234-/);
    expect(result.url).toMatch(/^https:\/\/signed\.example\/faces\//);
    expect(client.put.mock.calls[0][2].headers['x-oss-object-acl']).toBe('private');
    expect(client.signatureUrl.mock.calls[0][1]).toEqual({ expires: 900 });
  });

  test('keeps product and face access policies separate', async () => {
    const client = {
      put: jest.fn(async (key) => ({ name: key, url: `https://public.example/${key}` })),
      signatureUrl: jest.fn(),
      delete: jest.fn()
    };
    const provider = createObjectStorageProvider({
      client,
      productImagesPublic: true,
      fsPromises: { readFile: async () => Buffer.from('image'), unlink: async () => undefined },
      now: () => 5678
    });

    const result = await provider.uploadProductImage({ ...file, originalname: 'product.jpg' });

    expect(result.key).toMatch(/^products\/5678-/);
    expect(client.put.mock.calls[0][2].headers['x-oss-object-acl']).toBe('public-read');
    expect(result.url).toMatch(/^https:\/\/public\.example\/products\//);
  });

  test('refreshes private product URLs but preserves public product URLs', () => {
    const client = {
      put: jest.fn(),
      signatureUrl: jest.fn((key, options) => `signed://${key}?expires=${options.expires}`),
      delete: jest.fn()
    };
    const privateProvider = createObjectStorageProvider({
      client,
      productImagesPublic: false,
      fsPromises: { readFile: jest.fn(), unlink: jest.fn() }
    });
    const publicProvider = createObjectStorageProvider({
      client,
      productImagesPublic: true,
      fsPromises: { readFile: jest.fn(), unlink: jest.fn() }
    });

    expect(privateProvider.getProductUrl('products/private.jpg', 'expired://url'))
      .toBe('signed://products/private.jpg?expires=3600');
    expect(publicProvider.getProductUrl('products/public.jpg', 'https://cdn.example/public.jpg'))
      .toBe('https://cdn.example/public.jpg');
  });

  test('deletes only the resolved object key', async () => {
    const client = { put: jest.fn(), signatureUrl: jest.fn(), delete: jest.fn(async () => undefined) };
    const provider = createObjectStorageProvider({
      client,
      productImagesPublic: false,
      fsPromises: { readFile: jest.fn(), unlink: jest.fn() }
    });

    await provider.deleteObject('faces/private.jpg');

    expect(client.delete).toHaveBeenCalledWith('faces/private.jpg');
  });
});
