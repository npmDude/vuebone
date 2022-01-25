import { Model } from '../src';

describe('model', () => {
    class TestModel extends Model {
        idAttribute = 'user_id';
    }
    const testModel = new TestModel();

    it('instance', () => {
        expect(testModel instanceof Model).toEqual(true);
    });

    test('url', () => {
        testModel.urlRoot = '/people';

        expect(testModel.url()).toEqual('/people');
    });

    test('url_with_id', () => {
        testModel.set({ user_id: 1 });

        expect(testModel.url()).toEqual('/people/1');
    });
});