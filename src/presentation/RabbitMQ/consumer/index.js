const amqp = require('amqplib');
const path = require('path');
const infoging = require('../../../common/logging');
const config = require('../../../configuration');
const { getNumberArrayActives } = require('../../../common/utils/helper');

function init({ messagesDetailRepository }) {
  async function setupMessageConsumer() {
    try {
      const amqpServer = config.rabbitServer;
      const connection = await amqp.connect(amqpServer);
      const channel = await connection.createChannel();

      getNumberArrayActives().then((NumberArrayActives) => {
        NumberArrayActives.forEach((numberActive) => {
          const queue = `messagesPending-${numberActive}`;
          infoging.info(`RabbitMQ consume : ${queue}`);

          channel.assertQueue(queue, {
            durable: true,
            arguments: {
              'x-queue-type': 'quorum',
            },
          });
          channel.prefetch(1);

          channel.consume(queue, async (data) => {
            const messageBuffer = data.content;
            const messageString = messageBuffer.toString();
            const messageObject = JSON.parse(messageString);

            if (messageObject && messageObject.arrayBody) {
              const messageObjectArrayBodyAsc = messageObject.arrayBody.sort(
                (a, b) => a.order - b.order,
              );

              for (let i = 0; i < messageObjectArrayBodyAsc.length; i += 1) {
                messagesDetailRepository.updateStatusMessageDetail({
                  id: messageObjectArrayBodyAsc[i].id,
                  attempts: 1,
                  status: 'processing',
                  descriptionStatus: 'processing in rabbitmq',
                });

                const folderPath = path.join(
                  __dirname,
                  '../../SessionsWsp',
                  messageObject.from,
                );

                // eslint-disable-next-line import/no-dynamic-require, global-require
                const { adapterProvider } = require(folderPath);

                if (messageObjectArrayBodyAsc[i].fileUrl) {
                  // eslint-disable-next-line no-await-in-loop
                  await adapterProvider.sendMedia(
                    `${messageObject.to}@c.us`,
                    messageObjectArrayBodyAsc[i].fileUrl,
                    messageObjectArrayBodyAsc[i].text || '',
                  );
                } else {
                  // eslint-disable-next-line no-await-in-loop
                  await adapterProvider.sendText(
                    `${messageObject.to}@c.us`,
                    messageObjectArrayBodyAsc[i].text,
                  );
                }

                messagesDetailRepository.updateStatusMessageDetail({
                  id: messageObjectArrayBodyAsc[i].id,
                  attempts: 1,
                  status: 'sent',
                  descriptionStatus: 'sent message',
                });
              }
            }
            channel.ack(data);
          });
        });
      });
      infoging.info('RabbitMQ connected');
    } catch (err) {
      infoging.error(`Failed to connect to RabbitMQ: ${err.message} `);
    }
  }

  return {
    setupMessageConsumer,
  };
}
module.exports.init = init;