const {
    isObject,
    first,
    flatten,
    get,
    kebabCase
  } = require('lodash');

const { NavigationError } = require('../../utils/NavigationError');
const { TEMPLATE_DEFAULT } = require('./constant');

module.exports = {
    extractMeta(plugins) {
        const { navigation: plugin } = plugins;
        const { navigation: service } = plugin.services;
        const {
          navigation: masterModel,
          navigationitem: itemModel,
          audience: audienceModel,
        } = plugin.models;
        return {
          masterModel,
          itemModel,
          audienceModel,
          service,
          plugin,
          pluginName: plugin.package.strapi.name.toLowerCase(),
        };
      },

    checkDuplicatePath(parentItem, checkData) {
        return new Promise((resolve, reject) => {
          if (parentItem && parentItem.items) {
            for (let item of checkData) {
              for (let _ of parentItem.items) {
                if (_.path === item.path && _.id !== item.id) {
                  return reject(
                    new NavigationError(
                      `Duplicate path:${item.path} in parent: ${parentItem.title || 'root'} for ${item.title} and ${_.title} items`,
                      {
                        parentTitle: parentItem.title,
                        parentId: parentItem.id,
                        path: item.path,
                        errorTitles: [item.title, _.title],
                      },
                    ),
                  );
                }
              }
            }
          }
          return resolve();
        });
      },

    buildNestedStructure(entities, id = null, field = 'parent') {
      return entities
        .filter(entity => {
          if (entity[field] === null && id === null) {
            return true;
          }
          let data = entity[field];
          if (data && typeof id === 'string') {
            data = data.toString();
          }
          return (data && data === id) || (isObject(entity[field]) && (entity[field].id === id));
        })
        .map(entity => {
          return ({
            ...entity,
            items: this.buildNestedStructure(entities, entity.id, field),
          });
        });
    },

    getTemplateComponentFromTemplate(template = []) {
      const componentName = get(first(template), '__component');
      return componentName ? strapi.components[componentName] : null;
    },

    async templateNameFactory(items, strapi) {
      const flatRelated = flatten(items.map(i => i.related));
      const relatedMap = flatRelated.reduce((acc, curr) => {
        if (!acc[curr.__contentType]) {
          acc[curr.__contentType] = [];
        }
        acc[curr.__contentType].push(curr.id);
        return acc;
      }, {});
      const responses = await Promise.all(
        Object.entries(relatedMap)
          .map(
            ([contentType, ids]) => {
              return strapi.query(kebabCase(contentType))
                           .find({ id_in: ids })
                           .then(res => ({ [contentType]: res }));
            }),
      );
      const relatedResponseMap = responses.reduce((acc, curr) => ({ ...acc, ...curr }), {});

      return (contentType, id) => {
        const template = get(relatedResponseMap[contentType].find(data => data.id === id), 'template');
        const templateComponent = this.getTemplateComponentFromTemplate(template);
        return get(templateComponent, 'options.templateName', TEMPLATE_DEFAULT);
      };
    },

    sendAuditLog(auditLogInstance, event, data) {
      if (auditLogInstance && auditLogInstance.emit) {
        auditLogInstance.emit(event, data);
      }
    },

    prepareAuditLog(actions) {
      return [
        ...new Set(
          actions
            .filter(_ => !!_)
            .flatMap(({ remove, create, update }) => {
              return [create ? 'CREATE' : '', update ? 'UPDATE' : '', remove ? 'REMOVE' : '']
                .filter(_ => !!_);
            }),
        ),
      ]
        .join('_');
    },

};
