sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",  
    "sap/m/MessageToast",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], (Controller, JSONModel, MessageToast, Filter, FilterOperator) => {
    "use strict";

    return Controller.extend("zquaisofa.controller.Quais", {
        onInit() {
            // Récupération du modèle principal (logModel)
            var oModel = this.getOwnerComponent().getModel('logModel');
            this.getView().setModel(oModel);

            // Initialisation des variables pour la pagination
            this.iTop = 100;
            this.iSkip = 0;

            // Lancer le traitement paginé de synchronisation
            this.loadDataAndSync();

            // Création du viewModel pour gérer le mode édition
            const oViewModel = new JSONModel({
                editMode: false
            });
            this.getView().setModel(oViewModel, "viewModel");

            // Création du modèle pour les priorités
            var oPriorityModel = new JSONModel({
                priorities: [
                  { key: "0", text: " " },  
                  { key: "1", text: "1" },
                  { key: "2", text: "2" },
                  { key: "3", text: "3" },
                  { key: "4", text: "4" }
                ]
            });
            this.getView().setModel(oPriorityModel, "priorityModel");
        },

        /**
         * Charge et synchronise les données par lots (page par page)
         */
        loadDataAndSync: function() {
            var that = this;
            var oModel = this.getOwnerComponent().getModel('logModel');

            // Lecture de la CDS spécifique (/ZCDS_QUAIS_V2) pour le lot actuel
            oModel.read("/ZCDS_QUAIS_SPE_FF", {
                urlParameters: {
                    "$top": that.iTop,
                    "$skip": that.iSkip
                },
                success: function(oDataAppQuais) {
                    var aAppEntries = oDataAppQuais.results;
                    console.log("Page CDS spécifique:", aAppEntries);

                    // Lecture de la CDS standard (/ZCDS_STOCK_QUAIS_V2) pour le même lot
                    oModel.read("/ZCDS_QUAIS_STND_FF", {
                        urlParameters: {
                            "$top": that.iTop,
                            "$skip": that.iSkip
                        },
                        success: function(oDataStockQuais) {
                            var aStockEntries = oDataStockQuais.results;
                            console.log("Page CDS standard:", aStockEntries);
                            var aNewEntries = [];

                            // Optimisation : création d'un index à partir des enregistrements CDS spécifiques
                            var mAppIndex = {};
                            aAppEntries.forEach(function(oEntry) {
                                var sKey = oEntry.Codearticle.toString() + "|" + oEntry.Division.toString() + "|" + oEntry.Magasin.toString();
                                mAppIndex[sKey] = true;
                            });

                            // Comparaison des enregistrements standard avec l'index
                            aStockEntries.forEach(function(oStockEntry) {
                                var sKey = oStockEntry.CodeArticle.toString() + "|" + oStockEntry.Division.toString() + "|" + oStockEntry.Magasin.toString();
                                if (!mAppIndex[sKey]) {
                                    aNewEntries.push({
                                        Codearticle: oStockEntry.CodeArticle,
                                        Division: oStockEntry.Division,
                                        Magasin: oStockEntry.Magasin,
                                        Stock: oStockEntry.Stock,
                                        Quai1: 0,
                                        Quai2: 0,
                                        Quai3: 0,
                                        Quai4: 0
                                    });
                                }
                            });

                            console.log("Nouveaux enregistrements pour ce lot :", aNewEntries);

                            // Création des nouveaux enregistrements détectés pour ce lot
                            aNewEntries.forEach(function(oNewEntry) {
                                oModel.create("/ZCDS_QUAIS_SPE_FF", oNewEntry, {
                                    success: function() {
                                        console.log("Enregistrement créé :", oNewEntry);
                                    },
                                    error: function(oError) {
                                        console.error("Erreur lors de la création :", oError);
                                    }
                                });
                            });

                            // S'il y a exactement iTop enregistrements dans le lot lu,
                            // on suppose qu'il y a potentiellement d'autres pages à charger.
                            if (aStockEntries.length === that.iTop) {
                                that.iSkip += that.iTop;
                                that.loadDataAndSync(); // Charger le prochain lot
                            } else {
                                console.log("Synchronisation terminée, toutes les pages ont été traitées.");
                            }
                        },
                        error: function(oError) {
                            console.error("Erreur lecture STOCK_QUAIS_V2 :", oError);
                        }
                    });
                },
                error: function(oError) {
                    console.error("Erreur lecture QUAIS_V2 :", oError);
                }
            });
        },

        onEditPress() { 
            this.getView().getModel("viewModel").setProperty("/editMode", true);
        },

        onSavePress: function() {
            var oModel = this.getView().getModel("logModel");
            var oTable = this.byId("table");
        
            // For sap.m.Table, the items are in the 'items' aggregation:
            var aItems = oTable.getItems();
        
            aItems.forEach(function(oItem) {
                // Get the binding context for each item
                var oContext = oItem.getBindingContext(); // or getBindingContext("logModel") if needed
                var oData = oContext.getObject();
                var sPath = oContext.getPath();
                console.log(sPath);
        
                var oPayload = {
                    Quai1: parseInt(oData.Quai1, 10),
                    Quai2: parseInt(oData.Quai2, 10),
                    Quai3: parseInt(oData.Quai3, 10),
                    Quai4: parseInt(oData.Quai4, 10)
                };
        
                oModel.update(sPath, oPayload, {
                    success: function() {
                        console.log("Ligne mise à jour : " + sPath);
                    },
                    error: function(oError) {
                        console.error("Erreur de mise à jour pour " + sPath, oError);
                    }
                });
            });
        
            sap.m.MessageToast.show("Les mises à jour ont été envoyées.");
            this.getView().getModel("viewModel").setProperty("/editMode", false);
        },
        

        onCancelPress() { 
            var oModel = this.getView().getModel();
            oModel.resetChanges();
            this.getView().getModel("viewModel").setProperty("/editMode", false);
        },

        onQuaiChange(oEvent) {
            const oSelect = oEvent.getSource();
            const sSelectedKey = oSelect.getSelectedKey();
            const oContext = oSelect.getBindingContext();
            const sPath = oContext.getPath();
            const oData = this.getView().getModel().getProperty(sPath);
            const sProperty = oSelect.getBindingInfo("selectedKey").binding.sPath; 
            const aQuais = ["Quai1", "Quai2", "Quai3", "Quai4"];
            const bAlreadyUsed = aQuais.some(q => {
                return q !== sProperty && oData[q] == sSelectedKey; 
            });
  
            if (bAlreadyUsed) {
                MessageToast.show(`La priorité ${sSelectedKey} est déjà occupée.`);
                oSelect.setSelectedKey(oData[sProperty]);
            } else {
                this.getView().getModel().setProperty(sPath + "/" + sProperty, sSelectedKey);
            }
        },

        onValueHelpRequest: function (oEvent) {
            var sInputId = oEvent.getSource().getId();
            // Gestion des ValueHelp pour Code Article, Division et Magasin (voir code d'origine)
            if (sInputId.indexOf("filtreCodeArticle") !== -1) {
                if (!this._oProductVHDialog) {
                    this._oProductVHDialog = sap.ui.xmlfragment("sd17appquaisff.fragments.ProductVHDialog", this);
                    this.getView().addDependent(this._oProductVHDialog);
                    var oTable = sap.ui.getCore().byId("productVHTable");
                    var oModel = this.getView().getModel("logModel");
                    oTable.setModel(oModel);
                    var oTemplate = new sap.m.ColumnListItem({
                        type: "Active",
                        cells: [
                            new sap.m.Text({ text: "{Product}" })
                        ]
                    });
                    oTable.bindItems({
                        path: "/ZCDS_PRODUCT_FF", 
                        template: oTemplate
                    });
                }
                this._oProductVHDialog.open();
            } else if (sInputId.indexOf("filtreDivision") !== -1) {
                if (!this._oPlantVHDialog) {
                    this._oPlantVHDialog = sap.ui.xmlfragment("sd17appquaisff.fragments.PlantVHDialog", this);
                    this.getView().addDependent(this._oPlantVHDialog);
                    var oTable = sap.ui.getCore().byId("plantVHTable");
                    var oModel = this.getView().getModel("logModel");
                    oTable.setModel(oModel);
                    var oTemplate = new sap.m.ColumnListItem({
                        type: "Active",
                        cells: [
                            new sap.m.Text({ text: "{Plant}" }),
                            new sap.m.Text({ text: "{PlantName}" })
                        ]
                    });
                    oTable.bindItems({
                        path: "/ZCDS_PLANT_FF", 
                        template: oTemplate
                    });
                }
                this._oPlantVHDialog.open();
            } else if (sInputId.indexOf("filtreMagasin") !== -1) {
                if (!this._oMagasinVHDialog) {
                    this._oMagasinVHDialog = sap.ui.xmlfragment("sd17appquaisff.fragments.MagasinVHDialog", this);
                    this.getView().addDependent(this._oMagasinVHDialog);
                    var oTable = sap.ui.getCore().byId("magasinVHTable");
                    var oModel = this.getView().getModel("logModel");
                    oTable.setModel(oModel);
                    var oTemplate = new sap.m.ColumnListItem({
                        type: "Active",
                        cells: [
                            new sap.m.Text({ text: "{StorageLocation}" }),
                            new sap.m.Text({ text: "{StorageLocationName}" })
                        ]
                    });
                    oTable.bindItems({
                        path: "/ZCDS_MAGASIN_FF", 
                        template: oTemplate
                    });
                }
                this._oMagasinVHDialog.open();
            }
        },

        onProductVHSelect: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("listItem");
            if (!oSelectedItem) { return; }
            var sValue = oSelectedItem.getCells()[0].getText();
            this.byId("filtreCodeArticle").setValue(sValue);
            this._oProductVHDialog.close();
        },

        onPlantVHSelect: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("listItem");
            if (!oSelectedItem) { return; }
            var sValue = oSelectedItem.getCells()[0].getText();
            this.byId("filtreDivision").setValue(sValue);
            this._oPlantVHDialog.close();
        },

        onMagasinVHSelect: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("listItem");
            if (!oSelectedItem) { return; }
            var sValue = oSelectedItem.getCells()[0].getText();
            this.byId("filtreMagasin").setValue(sValue);
            this._oMagasinVHDialog.close();
        },

        onCloseValueHelp: function (oEvent) {
            var oDialog = oEvent.getSource().getParent();
            oDialog.close();
        },

        onSearch: function (oEvent) {
            var sCodeArticle = this.byId("filtreCodeArticle").getValue();
            var sDivision    = this.byId("filtreDivision").getValue();
            var sMagasin     = this.byId("filtreMagasin").getValue();
            
            var aFilters = [];

            if (sCodeArticle && sCodeArticle.trim() !== "") {
                aFilters.push(new Filter("Codearticle", FilterOperator.Contains, sCodeArticle));
            }
            if (sDivision && sDivision.trim() !== "") {
                aFilters.push(new Filter("Division", FilterOperator.Contains, sDivision));
            }
            if (sMagasin && sMagasin.trim() !== "") {
                aFilters.push(new Filter("Magasin", FilterOperator.Contains, sMagasin));
            }
            
            var oTable = this.byId("table");
            var oBinding = oTable.getBinding("rows");
            oBinding.filter(aFilters);
        }
    });
});