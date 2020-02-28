"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var Broker = /** @class */ (function () {
    function Broker(client, process, tracer) {
        var _this = this;
        this.client = client;
        this.process = process;
        this.tracer = tracer;
        this.onClientClose = function (err) {
            throw err;
        };
        this.closeClient = function () {
            _this.client.close();
            throw new Error('Broker closed');
        };
        client.on('connection_lost', this.onClientClose);
        client.on('error', this.closeClient);
        process.on('SIGUSR2', this.closeClient);
    }
    Broker.prototype.defaultOptions = function () {
        return this.client
            .subscriptionOptions()
            .setStartWithLastReceived();
    };
    Broker.prototype.on = function (eventName, callback, _options) {
        var _this = this;
        var options = _options || this.defaultOptions();
        var subscription = options.groupName
            ? this.client.subscribe(eventName, options.groupName, options)
            : this.client.subscribe(eventName, options);
        subscription.on('message', function (message) {
            var parsedData = _this.parseMessage(message);
            var span = _this.tracer.spanFromEvent(parsedData);
            span.log({ eventId: parsedData.metadata.id });
            try {
                callback(parsedData, message);
            }
            catch (err) {
                span.log({ error: err });
            }
            finally {
                span.finish();
            }
        });
    };
    Broker.prototype.parseMessage = function (message) {
        var data = message.getData();
        return typeof data === 'string'
            ? JSON.parse(data)
            : JSON.parse(data.toString('utf8'));
    };
    Broker.prototype.publish = function (event, contextSource) {
        var _this = this;
        var span = this.tracer.spanFromRequest(event.metadata.type, contextSource);
        this.tracer.injectEvent(span, event);
        span.log({ event: event });
        return new Promise(function (resolve, reject) {
            _this.client.publish(event.metadata.type, JSON.stringify(event), function (err, guid) {
                if (err) {
                    span.log({ error: err });
                    span.finish();
                    return reject(err);
                }
                span.log({ guid: guid });
                span.finish();
                resolve(guid);
            });
        });
    };
    return Broker;
}());
exports.Broker = Broker;
