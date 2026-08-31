import { Types } from 'mongoose';
import { documentId } from './document-id';

/**
 * The one reader of a stored document's id. Every caller writes a cook's id
 * into a query or an update, so what matters is that a document without one is
 * answered rather than throwing, and that the answer is a string whatever the
 * store handed back.
 */
describe('documentId', () => {
  it('reads a hydrated document’s ObjectId as the string a query is written with', () => {
    const id = new Types.ObjectId();

    expect(documentId({ _id: id })).toBe(id.toString());
  });

  it('reads a lean document’s id, which is already a string', () => {
    expect(documentId({ _id: 'smoke-id' })).toBe('smoke-id');
  });

  it('answers nothing for a document that carries no id', () => {
    expect(documentId({})).toBeNull();
    expect(documentId({ _id: null })).toBeNull();
  });

  it('answers nothing for no document at all', () => {
    expect(documentId(null)).toBeNull();
    expect(documentId(undefined)).toBeNull();
  });
});
