package com.mathu.racegame.question.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "template_variables")
@Getter
@Setter
@NoArgsConstructor
public class TemplateVariable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(name = "variable_type", nullable = false, length = 20)
    private VariableType variableType;

    @Column(nullable = false, length = 100)
    private String value;

    // Raw JSON string for optional structured metadata. Examples:
    //   NUMBER type:   {"range": [1, 100]}
    //   OPERATOR type: {"symbol": "+", "operation": "addition"}
    // Parsed by the service layer as needed; kept opaque at the entity level.
    @Column(columnDefinition = "JSON")
    private String metadata;
}
