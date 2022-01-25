import { Model } from '../src';

describe('model', () => {
    class TestModel extends Model {
        static idAttribute: string = 'user_id';
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
        testModel.set({ id: 1 });

        expect(testModel.url()).toEqual('/people/1');
    });

    test('id_attribute', () => {
        expect(TestModel.idAttribute).toEqual('user_id');
    });
});